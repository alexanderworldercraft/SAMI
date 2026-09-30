import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  tx: {
    $queryRaw: vi.fn(),
    userInterfacePreference: { findUnique: vi.fn(), upsert: vi.fn() },
    userDevice: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  },
  transaction: vi.fn(),
}));
vi.mock("../services/db.js", () => ({ prisma: { ...mocks.tx, $transaction: mocks.transaction } }));
const { userInterfaceController: controller, validateInterfaceDevice } = await import("../controllers/userInterfaceController.js");
const key = "3f8aa992-839e-4199-9291-f1b5db3c2104";
const draft = { Nom: "Salon", Type: "computer", InterfaceMode: "remote" };
const reply = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() });
const request = (body, id = "12") => ({ user: { userId: 31 }, body, params: { id } });

describe("consentement et appareils d'interface", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((operation) => operation(mocks.tx));
    mocks.tx.userInterfacePreference.findUnique.mockResolvedValue({ Accepted: true });
  });
  it("ne crée rien pour un choix non répondu", async () => {
    mocks.tx.userInterfacePreference.findUnique.mockResolvedValue(null);
    const response = reply();
    await controller.get(request(), response);
    expect(response.send).toHaveBeenCalledWith({ UtilisateurID: 31, accepted: null, devices: [] });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.tx.userDevice.findMany).not.toHaveBeenCalled();
  });
  it("refuse les dates et les champs réservés envoyés par le client", () => {
    expect(validateInterfaceDevice({ ...draft, UpdateDate: "2020" })).toBeTruthy();
    expect(validateInterfaceDevice({ ...draft, UtilisateurID: 9 })).toBeTruthy();
    expect(validateInterfaceDevice({ ...draft, deviceKey: key }, true)).toBeNull();
    for (const invalid of [{ ...draft, Nom: " " }, { ...draft, Type: "console" }, { ...draft, InterfaceMode: "bad" }]) expect(validateInterfaceDevice(invalid)).toBeTruthy();
  });
  it("supprime tous les appareils et mémorise le refus sous un même verrou et une même transaction", async () => {
    const response = reply();
    await controller.consent(request({ accepted: false }), response);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$queryRaw).toHaveBeenCalled();
    expect(mocks.tx.userDevice.deleteMany).toHaveBeenCalledWith({ where: { UtilisateurID: 31 } });
    expect(mocks.tx.userInterfacePreference.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { Accepted: false } }));
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.userDevice.deleteMany.mock.invocationCallOrder[0]);
    expect(response.send).toHaveBeenCalledWith({ accepted: false });
  });
  it("ne crée pas d'appareil quand le consentement est refusé", async () => {
    mocks.tx.userInterfacePreference.findUnique.mockResolvedValue({ Accepted: false });
    const response = reply();
    await controller.register(request({ ...draft, deviceKey: key }), response);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.tx.userDevice.upsert).not.toHaveBeenCalled();
  });
  it("enregistre une interface remote choisie pour un ordinateur, en limitant la clé au compte", async () => {
    const response = reply();
    await controller.register(request({ ...draft, deviceKey: key }), response);
    expect(mocks.tx.userDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { UtilisateurID_DeviceKey: { UtilisateurID: 31, DeviceKey: key } },
      create: expect.objectContaining({ ...draft, UtilisateurID: 31 }),
    }));
  });
  it("isole modification et suppression par propriétaire", async () => {
    mocks.tx.userDevice.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.userDevice.deleteMany.mockResolvedValue({ count: 0 });
    for (const action of ["update", "remove"]) {
      const response = reply();
      await controller[action](request(draft), response);
      expect(response.status).toHaveBeenCalledWith(404);
    }
    expect(mocks.tx.userDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { UserDeviceID: 12, UtilisateurID: 31 } }));
    expect(mocks.tx.userDevice.deleteMany).toHaveBeenCalledWith({ where: { UserDeviceID: 12, UtilisateurID: 31 } });
  });
  it("rejette un identifiant invalide et un consentement non booléen", async () => {
    const response = reply();
    await controller.remove(request(null, "NaN"), response);
    expect(response.status).toHaveBeenCalledWith(400);
    await controller.consent(request({ accepted: "true" }), response);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("un appareil inconnu reste non enregistré", async () => {
    mocks.tx.userDevice.findFirst.mockResolvedValue(null);
    const response = reply();
    await controller.resolve(request({ deviceKey: key }), response);
    expect(response.send).toHaveBeenCalledWith({ device: null });
    expect(mocks.tx.userDevice.upsert).not.toHaveBeenCalled();
    expect(mocks.tx.userDevice.updateMany).not.toHaveBeenCalled();
  });
  it("actualise uniquement la dernière utilisation de l'appareil reconnu", async () => {
    const device = { UserDeviceID: 12, UpdateDate: new Date("2026-09-01") };
    mocks.tx.userDevice.findFirst.mockResolvedValue(device);
    await controller.resolve(request({ deviceKey: key }), reply());
    expect(mocks.tx.userDevice.updateMany).toHaveBeenCalledWith({
      where: { UtilisateurID: 31, DeviceKey: key },
      data: { LastUsedDate: expect.any(Date), UpdateDate: device.UpdateDate },
    });
  });
});
