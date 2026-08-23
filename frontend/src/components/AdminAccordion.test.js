import { fireEvent, render, screen } from "@testing-library/react";

import AdminAccordion from "./AdminAccordion";

it("monte chaque section à sa première ouverture puis la masque individuellement", () => {
  render(
    <AdminAccordion title="Section test" description="Description test">
      <p>Contenu chargé</p>
    </AdminAccordion>
  );

  const trigger = screen.getByRole("button", { name: /Section test/i });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Contenu chargé")).not.toBeInTheDocument();

  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Contenu chargé")).toBeVisible();

  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Contenu chargé")).not.toBeVisible();
});
