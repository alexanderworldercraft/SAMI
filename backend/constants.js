export const ETAT = Object.freeze({
  ACTIVE: 1,
  DELETED: 2,
  BLOCKED: 3,
});

export const GRADE = Object.freeze({
  SUPER_ADMIN: 1,
  ADMIN: 2,
  USER: 3,
});

export const ADMIN_GRADE_IDS = Object.freeze([GRADE.SUPER_ADMIN, GRADE.ADMIN]);

export const AUTH_COOKIE_NAME = "sami_token";

export const MULTIPART_LIMITS = Object.freeze({
  IMAGE_FILE_SIZE: 50 * 1024 * 1024,
  VIDEO_FILE_SIZE: 50 * 1024 * 1024 * 1024,
});
