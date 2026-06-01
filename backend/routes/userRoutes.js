// routes/userRoutes.js
import { userController } from '../controllers/userController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { userRepository } from '../models/user.js';

// petite fonction utilitaire
function isUserPremium(user) {
  // Si pas de date → pas premium
  if (!user?.PremiumEndDate) return false;

  // Compare la date actuelle avec PremiumEndDate
  const now = new Date();
  const end = new Date(user.PremiumEndDate);
  return end > now;
}

// Ajout des schema pour la documentation des routes.
export default async function userRoutes(fastify, options) {
  fastify.post("/logout", userController.logout);
  fastify.post('/register', userController.register);
  fastify.post('/login', userController.login);
  fastify.post('/reset-password', userController.resetPassword);
  fastify.post('/premium', { preHandler: authMiddleware }, userController.updatePremiumPlan);

  fastify.put('/update', { preHandler: fastify.auth }, userController.updateUser);
  fastify.put('/delete-account', userController.deleteAccount);
  fastify.put('/change-etat', userController.changeUserEtat);

  fastify.delete('/delete-profile-image', { preHandler: fastify.auth }, userController.deleteProfileImage);

  fastify.get('/get-users', { preHandler: authMiddleware }, userController.getUsersByCriteria);
  fastify.get('/admins', { preHandler: authMiddleware }, userController.getAdmins);
  fastify.get('/panel-users', { preHandler: authMiddleware }, userController.getUsersForAdminPanel);
  fastify.get('/activity-summary', { preHandler: authMiddleware }, userController.getUserActivitySummary);
  fastify.get('/watch-history/me', { preHandler: authMiddleware }, userController.getMyWatchHistory);
  fastify.get('/watch-history/:userId', { preHandler: authMiddleware }, userController.getUserWatchHistory);

  fastify.get('/me', { preHandler: authMiddleware }, async (request, reply) => {
  try {
    const { userId } = request.user;
    const user = await userRepository.getUserById(userId);

    if (!user) {
      return reply.status(404).send({ error: "Utilisateur introuvable" });
    }

    reply.send({
      ...user,
      isPremium: isUserPremium(user),
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    reply.status(500).send({ error: 'Internal Server Error' });
  }
});
}
