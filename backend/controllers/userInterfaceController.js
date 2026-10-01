import { prisma } from "../services/db.js";

const MODES = ["classic", "tactile", "remote"];
const TYPES = ["computer", "phone", "tablet", "tv", "unknown"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deviceFields = {
  UserDeviceID: true, Nom: true, Type: true, InterfaceMode: true,
  CreateDate: true, UpdateDate: true, LastUsedDate: true,
};
const failure = (status, message) => Object.assign(new Error(message), { status });

export function validateInterfaceDevice(body, withKey = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Appareil invalide.";
  const allowed = withKey ? ["Nom", "Type", "InterfaceMode", "deviceKey"] : ["Nom", "Type", "InterfaceMode"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return "Champ non modifiable ou inconnu.";
  if (typeof body.Nom !== "string" || !body.Nom.trim() || body.Nom.trim().length > 100) return "Le nom doit contenir entre 1 et 100 caractères.";
  if (!TYPES.includes(body.Type)) return "Type d'appareil invalide.";
  if (!MODES.includes(body.InterfaceMode)) return "Interface invalide.";
  if (withKey && (typeof body.deviceKey !== "string" || !UUID.test(body.deviceKey))) return "Identifiant d'appareil invalide.";
  return null;
}

// Toutes les écritures prennent le même verrou, pour empêcher un enregistrement
// concurrent de survivre à la révocation du consentement.
async function locked(userId, operation) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT UtilisateurID FROM Utilisateur WHERE UtilisateurID = ${userId} FOR UPDATE`;
    return operation(tx);
  });
}
async function requireConsent(tx, userId) {
  const preference = await tx.userInterfacePreference.findUnique({ where: { UtilisateurID: userId } });
  if (!preference?.Accepted) throw failure(403, "L'enregistrement des appareils doit être accepté.");
}
const deviceData = (body) => ({ Nom: body.Nom.trim(), Type: body.Type, InterfaceMode: body.InterfaceMode });
const wrap = (operation) => async (request, reply) => {
  try {
    return reply.send(await operation(request, Number(request.user.userId)));
  } catch (error) {
    if (!error.status) console.error("Erreur des préférences d'interface :", error);
    return reply.status(error.status || 500).send({ error: error.status ? error.message : "Impossible de traiter les préférences d'interface." });
  }
};
const parseId = (request) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw failure(400, "Identifiant invalide.");
  return id;
};

export const userInterfaceController = {
  get: wrap(async (_, userId) => {
    const preference = await prisma.userInterfacePreference.findUnique({ where: { UtilisateurID: userId } });
    return {
      UtilisateurID: userId,
      accepted: preference?.Accepted ?? null,
      devices: preference?.Accepted ? await prisma.userDevice.findMany({
        where: { UtilisateurID: userId }, select: deviceFields, orderBy: { CreateDate: "desc" },
      }) : [],
    };
  }),
  consent: wrap(async (request, userId) => {
    const body = request.body;
    if (!body || typeof body.accepted !== "boolean" || Object.keys(body).some((key) => key !== "accepted")) throw failure(400, "Choix invalide.");
    await locked(userId, async (tx) => {
      if (!body.accepted) await tx.userDevice.deleteMany({ where: { UtilisateurID: userId } });
      await tx.userInterfacePreference.upsert({
        where: { UtilisateurID: userId }, create: { UtilisateurID: userId, Accepted: body.accepted }, update: { Accepted: body.accepted },
      });
    });
    return { accepted: body.accepted };
  }),
  resolve: wrap(async (request, userId) => {
    const key = request.body?.deviceKey;
    if (typeof key !== "string" || !UUID.test(key)) throw failure(400, "Identifiant d'appareil invalide.");
    return locked(userId, async (tx) => {
      await requireConsent(tx, userId);
      const where = { UtilisateurID: userId, DeviceKey: key };
      const device = await tx.userDevice.findFirst({ where, select: deviceFields });
      if (!device) return { device: null };
      await tx.userDevice.updateMany({ where, data: { LastUsedDate: new Date(), UpdateDate: device.UpdateDate } });
      return { device: await tx.userDevice.findFirst({ where, select: deviceFields }) };
    });
  }),
  register: wrap(async (request, userId) => {
    const error = validateInterfaceDevice(request.body, true);
    if (error) throw failure(400, error);
    return locked(userId, async (tx) => {
      await requireConsent(tx, userId);
      const device = await tx.userDevice.upsert({
        where: { UtilisateurID_DeviceKey: { UtilisateurID: userId, DeviceKey: request.body.deviceKey } },
        create: { UtilisateurID: userId, DeviceKey: request.body.deviceKey, ...deviceData(request.body), LastUsedDate: new Date() },
        update: { ...deviceData(request.body), LastUsedDate: new Date() }, select: deviceFields,
      });
      return { device };
    });
  }),
  update: wrap(async (request, userId) => {
    const id = parseId(request);
    const error = validateInterfaceDevice(request.body);
    if (error) throw failure(400, error);
    return locked(userId, async (tx) => {
      await requireConsent(tx, userId);
      const where = { UserDeviceID: id, UtilisateurID: userId };
      const result = await tx.userDevice.updateMany({ where, data: deviceData(request.body) });
      if (!result.count) throw failure(404, "Appareil introuvable.");
      return { device: await tx.userDevice.findFirst({ where, select: deviceFields }) };
    });
  }),
  remove: wrap(async (request, userId) => {
    const id = parseId(request);
    return locked(userId, async (tx) => {
      const result = await tx.userDevice.deleteMany({ where: { UserDeviceID: id, UtilisateurID: userId } });
      if (!result.count) throw failure(404, "Appareil introuvable.");
      return { removed: true };
    });
  }),
};
