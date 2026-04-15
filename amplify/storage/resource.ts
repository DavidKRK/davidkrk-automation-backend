import { defineStorage } from "@aws-amplify/backend";

/**
 * Stockage S3 — DavidKRK Uploads
 *
 * Chemins :
 *   uploads/{entity_id}/*          — espace privé par utilisateur authentifié
 *   public/{entity_id}/*           — fichiers publics scopés par utilisateur
 *
 * Accès :
 *   - uploads/{entity_id}/* : lecture + écriture + suppression réservées au propriétaire
 *   - public/{entity_id}/*  : lecture publique (guest + auth), écriture/suppression réservées au propriétaire
 */
export const storage = defineStorage({
  name: "davidkrkUploads",
  access: (allow) => ({
    // Espace privé : seul le propriétaire peut lire, écrire et supprimer
    "uploads/{entity_id}/*": [
      allow.authenticated.to(["read", "write", "delete"]),
    ],
    // Espace public scopé : lecture pour tous, écriture/suppression réservées au propriétaire
    "public/{entity_id}/*": [
      allow.authenticated.to(["read", "write", "delete"]),
      allow.guest.to(["read"]),
    ],
  }),
});
