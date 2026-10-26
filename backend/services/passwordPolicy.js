export const PASSWORD_POLICY_MESSAGE = "Le mot de passe doit contenir entre 8 et 20 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.";
export function validatePassword(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 20
    && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value)
    && /[!@#$%^&*(),.?":{}|<>]/.test(value);
}
