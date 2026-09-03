type AuthErrorLike = {
  code?: string;
  name?: string;
};

export const PASSWORD_RECOVERY_STORAGE_KEY =
  "ecoles237.auth.password-recovery";

export const WEAK_PASSWORD_REJECTED_MESSAGE =
  "Ce mot de passe est trop facile à deviner ou a déjà été compromis. Choisissez un mot de passe unique et plus robuste.";

export const WEAK_PASSWORD_SIGN_IN_MESSAGE =
  "Votre connexion a réussi, mais votre mot de passe ne répond plus aux recommandations de sécurité. Pensez à le remplacer rapidement par un mot de passe unique.";

const GENERIC_SIGN_UP_ERROR_MESSAGE =
  "Impossible de créer le compte avec ces informations. Vérifiez les champs ou connectez-vous si vous possédez déjà un compte.";

const GENERIC_PASSWORD_UPDATE_ERROR_MESSAGE =
  "Impossible de mettre à jour le mot de passe pour le moment. Demandez un nouveau lien et réessayez.";

export function isWeakPasswordError(error: AuthErrorLike | null): boolean {
  return (
    error?.code === "weak_password" || error?.name === "AuthWeakPasswordError"
  );
}

export function getSignUpErrorMessage(error: AuthErrorLike): string {
  return isWeakPasswordError(error)
    ? WEAK_PASSWORD_REJECTED_MESSAGE
    : GENERIC_SIGN_UP_ERROR_MESSAGE;
}

export function getPasswordUpdateErrorMessage(error: AuthErrorLike): string {
  return isWeakPasswordError(error)
    ? WEAK_PASSWORD_REJECTED_MESSAGE
    : GENERIC_PASSWORD_UPDATE_ERROR_MESSAGE;
}

export function getWeakPasswordSignInMessage(
  weakPassword: unknown
): string | null {
  return weakPassword == null ? null : WEAK_PASSWORD_SIGN_IN_MESSAGE;
}

export function canUsePasswordRecovery(
  event: string,
  hasSession: boolean,
  hasRecoveryMarker: boolean
): boolean {
  if (!hasSession) {
    return false;
  }

  return (
    event === "PASSWORD_RECOVERY" ||
    (event === "INITIAL_SESSION" && hasRecoveryMarker)
  );
}

export function validatePasswordPair(
  password: string,
  confirmation: string
): string | null {
  if (password !== confirmation) {
    return "Les mots de passe ne correspondent pas.";
  }

  if (password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }

  return null;
}
