import { defineStorage } from "@aws-amplify/backend";

/**
 * Stockage S3 — DavidKRK Uploads
 *
 * Chemins :
 *   uploads/{entity_id}/*          — espace privé scopé par identité (propriétaire uniquement)
 *   public/{entity_id}/*           — fichiers publics scopés par identité
 *
 * Accès :
 *   - uploads/{entity_id}/* : lecture + écriture + suppression réservées au propriétaire du préfixe
 *   - public/{entity_id}/*  : lecture publique (guest + auth), écriture/suppression réservées au propriétaire du préfixe
 */
export const storage = defineStorage({
  name: "davidkrkUploads",
  access: (allow) => ({
    // Espace privé : seul le propriétaire du préfixe peut lire, écrire et supprimer
    "uploads/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
    ],
    // Espace public scopé : lecture pour tous, écriture/suppression réservées au propriétaire du préfixe
    "public/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
      allow.authenticated.to(["read"]),
      allow.guest.to(["read"]),
    ],
  }),
});
