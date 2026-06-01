# AnimalView — Descriptif du projet

## Vue d'ensemble

**AnimalView** est une application web de suivi de la faune sauvage, inspirée du documentaire interactif *Bear 71*. Elle reconstruit les déplacements réels d'animaux à partir de données GPS et révèle, le long de leur trajet, l'imagerie au niveau de la rue (Street View) afin de donner à voir le paysage que l'animal a pu traverser.

L'application ne sert **que des données réelles** : pistes GPS issues de jeux de données scientifiques et de Movebank, imagerie publique réelle. Aucune donnée n'est fabriquée ou simulée à des fins de remplissage.

---

## Fonctionnalités principales

### 1. Reconstruction de trajets réels
- Sélection d'une **espèce**, d'une **étude** et d'un **individu**.
- Lecture animée du déplacement de l'animal sur une carte (vitesses 1× à 100×).
- Données issues de jeux de données scientifiques réels (ex. le loup *Slavc*).

### 2. Contexte visuel le long du trajet
- Détection des images Street View réellement situées **à proximité du trajet** (filtre d'intersection à ≤ 50 m de la polyligne du trajet).
- Aperçu des photos candidates avec distance exacte au trajet et niveau de confiance.
- Proxy serveur des images Street View : les octets sont relayés côté serveur, sans fuite de clé d'API ni redirection du navigateur.

### 3. « Through its eyes » — interprétation IA de la scène
Fonctionnalité phare. Lorsqu'on consulte une photo candidate sur le trajet :
- Un modèle de **vision IA (Gemini)** interprète l'image **à la première personne**, dans la voix de l'animal.
- Le récit évoque l'**habitat**, les **proies** potentielles et les **dangers** perçus, puis se termine par la décision instinctive de l'animal.
- États gérés : chargement, erreur, et affichage du récit.
- Une mention factuelle précise qu'il s'agit d'une **interprétation IA** d'imagerie proche (≤ 50 m), et non de la vue réelle de l'animal.

### 4. Carte et pression humaine
- Fond de carte sombre ou satellite.
- Couche optionnelle de « pression humaine » pour contextualiser l'environnement.

---

## Architecture technique

Monorepo **pnpm** organisé en *artifacts* et bibliothèques partagées.

| Composant | Rôle | Stack |
|-----------|------|-------|
| `artifacts/animal-view` | Frontend | React + Vite, MapLibre GL |
| `artifacts/api-server` | API backend | Express 5, Node.js 24 |
| `lib/api-spec` | Contrat d'API | OpenAPI → Orval (codegen) |
| `lib/api-client-react` | Hooks générés | React Query |
| `lib/api-zod` | Schémas de validation | Zod |
| `lib/integrations-gemini-ai` | Accès IA | Replit AI Integrations (Gemini) |

**Approche contrat-d'abord** : l'API est définie dans `openapi.yaml`, puis les hooks React Query et les schémas Zod sont générés automatiquement.

### Points d'API clés
- `GET /api/track` — trajet GPS d'un individu.
- `POST /api/match-imagery` — images Street View proches du trajet (filtrées à ≤ 50 m).
- `GET /api/streetview-image` — proxy des octets d'image (sécurisé).
- `POST /api/analyze-imagery` — interprétation IA de la scène en voix d'animal.

---

## Sécurité et robustesse

- **Anti-SSRF** : les requêtes serveur vers les images sont restreintes à une liste d'hôtes autorisés, en HTTPS, avec `redirect: "error"` pour empêcher tout contournement par redirection.
- **Aucune fuite de clé** : les URL porteuses de clé d'API sont construites et utilisées uniquement côté serveur.
- **Cache de récits** dont la clé inclut tous les champs influençant le prompt (espèce, nom scientifique, habitat, cap, distance) pour éviter de réutiliser un récit hors contexte.
- **Garde anti-course** côté frontend : une réponse IA périmée ne peut plus écraser l'affichage courant.

---

## Sources de données

- **Movebank** — base de données scientifique de suivi animal (identifiants en variables d'environnement).
- **Jeux de pistes GPS réels** fournis avec l'application.
- **Google Street View** — imagerie publique au niveau de la rue.
- **Gemini (vision)** via Replit AI Integrations — interprétation des images (facturée aux crédits).

---

## Lancer le projet

```bash
# API (port 5000)
pnpm --filter @workspace/api-server run dev

# Vérification des types (tous les paquets)
pnpm run typecheck

# Régénérer les hooks et schémas depuis l'OpenAPI
pnpm --filter @workspace/api-spec run codegen
```

**Variable d'environnement requise** : `DATABASE_URL` (PostgreSQL).
**Secrets utilisés** : `GOOGLE_MAPS_API_KEY`, `MOVEBANK_USERNAME`, `MOVEBANK_PASSWORD`, `SESSION_SECRET`, ainsi que les variables d'intégration Gemini.

> Pour activer la fonctionnalité IA en production, il faut **republier** l'application après déploiement du nouveau code et des variables d'intégration.
