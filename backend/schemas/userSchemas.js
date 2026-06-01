// schemas/userSchemas.js

export const userSchema = {
    type: 'object',
    properties: {
        UtilisateurID: { type: 'integer', description: 'ID unique de l’utilisateur.' },
        Surnom: { type: 'string', description: 'Nom d’utilisateur.' },
        Email: { type: 'string', format: 'email', description: 'Adresse email de l’utilisateur.' },
        CheminImage: { type: 'string', description: 'URL de l’image de profil.' },
        EtatID: { type: 'integer', description: 'État actuel de l’utilisateur.' },
        GradeID: { type: 'integer', description: 'Grade de l’utilisateur.' },
    },
};

export const errorResponseSchema = {
    type: 'object',
    properties: {
        error: { type: 'string', description: 'Message d’erreur.' },
        message: { type: 'string', description: 'Description supplémentaire de l’erreur.' },
    },
};

export const registerSchema = {
    description: 'Enregistre un nouvel utilisateur.',
    tags: ['Users'],
    body: {
        type: 'object',
        required: ['surnom', 'email', 'motDePasse'],
        properties: {
            surnom: { type: 'string', description: 'Nom d’utilisateur.' },
            email: { type: 'string', format: 'email', description: 'Adresse email.' },
            motDePasse: { type: 'string', description: 'Mot de passe de l’utilisateur.' },
            gradeId: { type: 'integer', description: 'Grade optionnel de l’utilisateur.' },
        },
    },
    response: {
        201: userSchema,
        400: errorResponseSchema,
    },
};

export const loginSchema = {
    description: "Connexion avec son compte Utilisateur.",
    tags: ['Users'],
    body: {
        type: 'object',
        required: ['surnom', 'motDePasse'],
        properties: {
            surnom: { type: 'string' },
            motDePasse: { type: 'string' },
        }
    },
    response: {
        201: {
            description: 'Connexion réussi',
            type: 'object',
        },
        400: {
            description: 'Surnom and Mot de Passe are required',
            type: 'object',
        },
        401: {
            description: 'Invalid credentials',
            type: 'object',
        },
        403: {
            description: 'Votre compte est bloqué. Veuillez contacter l\'administrateur.',
            type: 'object',
        },
    },
};

export const deleteProfileImageSchema = {
    description: "Supprime l'image de profil d’un utilisateur.",
    tags: ['Users'],
    response: {
        200: { type: 'object', properties: { message: { type: 'string', description: 'Message de succès.' } } },
        401: errorResponseSchema,
    },
};

export const getUsersByCriteriaSchema = {
    description: 'Récupère une liste d’utilisateurs par grade et état.',
    tags: ['Users'],
    querystring: {
        type: 'object',
        properties: {
            gradeId: { type: 'integer', description: 'ID du grade.' },
            etatId: { type: 'integer', description: 'ID de l’état.' },
        },
    },
    response: {
        200: {
            type: 'array',
            items: userSchema,
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
    },
};

export const deleteAccountSchema = {
    description: 'Supprime ou désactive le compte utilisateur actuel.',
    tags: ['Users'],
    response: {
        200: { type: 'object', properties: { message: { type: 'string', description: 'Message de succès.' } } },
        401: errorResponseSchema,
        500: errorResponseSchema,
    },
};

export const getAdminsSchema = {
    description: 'Récupère une liste de tous les administrateurs.',
    tags: ['Users'],
    security: [{ token: [] }], // Nécessite un token JWT
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            UtilisateurID: { type: 'integer', description: 'ID unique de l’utilisateur.' },
            Surnom: { type: 'string', description: 'Nom d’utilisateur.' },
            Email: { type: 'string', format: 'email', description: 'Adresse email.' },
            Grade: {
              type: 'object',
              properties: {
                Nom: { type: 'string', description: 'Nom du grade.' },
              },
            },
            GradeID: { type: 'integer', description: 'ID du grade.' },
            EtatID: { type: 'integer', description: 'État de l’utilisateur.' },
          },
        },
      },
      401: errorResponseSchema,
      403: errorResponseSchema,
    },
  };
  
  export const changeUserEtatSchema = {
    description: 'Modifie l’état d’un utilisateur.',
    tags: ['Users'],
    body: {
      type: 'object',
      required: ['userId', 'newEtat'],
      properties: {
        userId: { type: 'integer', description: 'ID de l’utilisateur à modifier.' },
        newEtat: { type: 'integer', description: 'Nouveau ID d’état de l’utilisateur.' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          message: { type: 'string', description: "Message de confirmation de la modification de l'état." },
          user: userSchema,
        },
      },
      400: errorResponseSchema,
      401: errorResponseSchema,
      403: errorResponseSchema,
      404: errorResponseSchema,
    },
  };
  
  export const getMeSchema = {
    description: 'Récupère les informations du profil de l’utilisateur connecté.',
    tags: ['Users'],
    security: [{ token: [] }], // Nécessite un token JWT
    response: {
      200: userSchema,
      401: errorResponseSchema,
      500: errorResponseSchema,
    },
  };
  