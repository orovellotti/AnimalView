import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "fr" | "en";

const STORAGE_KEY = "animalview-lang";

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const translations: Record<Lang, Record<string, string>> = {
  fr: {
    // --- Generic / controls ---
    "controls.show": "Afficher les contrôles",
    "controls.hide": "Masquer les contrôles",
    "controls.label": "Contrôles",
    "controls.species": "Espèce",
    "controls.study": "Étude",
    "controls.dataSource": "Source des données",
    "controls.individual": "Individu",
    "controls.searchRadius": "Rayon de recherche",
    "controls.duration": "Durée",
    "controls.startLocation": "Point de départ",
    "controls.selectSpecies": "Choisir une espèce...",
    "controls.selectStudy": "Choisir une étude...",
    "controls.selectIndividual": "Choisir un individu...",
    "controls.loadTrack": "Charger le trajet",
    "controls.humanPressure": "Pression humaine",
    "controls.humanPressureHeatmap": "Carte de pression humaine",
    "controls.humanPressureHint":
      "Superposer la présence humaine potentielle — sentiers, remontées, refuges, routes et zones bâties (OpenStreetMap).",
    "controls.humanPressureHintSim":
      "Densité de routes et de zones bâties (OSM). Générez d'abord un trajet pour alimenter les données.",
    "controls.durationWeek": "1 semaine",
    "controls.durationMonth": "1 mois",
    "controls.placeIndividual": "Placer l'individu",
    "controls.replaceIndividual": "Replacer l'individu",
    "controls.clickOnMap": "Cliquez sur la carte…",
    "controls.generateTrack": "Générer le trajet",
    "controls.simulating": "Simulation…",
    "controls.points": "Points",
    "controls.osmBarriers": "Barrières OSM",
    "controls.id": "ID",
    "controls.simFailed": "Échec de la simulation : {msg}",

    // --- Mode toggle ---
    "mode.real": "Trajets réels",
    "mode.sim": "Simulation",
    "mode.subtitleReal": "Reconstitution des trajets",
    "mode.subtitleSim": "Trajets synthétiques",

    // --- Basemap / theme / language ---
    "basemap.dark": "Sombre",
    "basemap.satellite": "Satellite",
    "theme.toLight": "Passer en mode clair",
    "theme.toDark": "Passer en mode sombre",

    // --- Disclaimers ---
    "disclaimer.sim.prefix": "Ce sont des ",
    "disclaimer.sim.highlight": "mouvements plausibles simulés",
    "disclaimer.sim.suffix":
      ", et non des localisations animales observées. Générés par marche aléatoire biaisée sur un gradient d'habitat et les barrières OpenStreetMap en temps réel.",
    "disclaimer.real":
      "AnimalView reconstitue les rencontres visuelles possibles le long des trajets de déplacement des animaux. Ce n'est pas une preuve de ce que l'animal a vu — c'est une approximation spatiale fondée sur l'imagerie publique au sol proche des points GPS enregistrés.",
    "banner.simMovements":
      "Mouvements plausibles simulés · pas de localisations animales observées",
    "banner.placeIndividual": "Cliquez n'importe où sur la carte pour déposer l'individu",

    // --- About dialog ---
    "about.aria": "À propos de cette simulation",
    "about.button": "À propos",
    "about.title": "TaxonPath — Méthode de simulation",
    "about.intro.1": "TaxonPath génère des trajectoires animales ",
    "about.intro.plausible": "plausibles",
    "about.intro.2":
      " — ni des prédictions, ni des observations. L'objectif est d'illustrer comment une espèce donnée ",
    "about.intro.might": "pourrait",
    "about.intro.3":
      " se déplacer dans un paysage compte tenu de son écologie et des barrières humaines réelles qui l'entourent.",
    "about.s1.title": "1 · Profils d'espèces",
    "about.s1.body":
      "Cinq profils ajustés à la main (renard roux, chevreuil, tortue d'Hermann, sanglier, loup gris). Chaque profil encode la longueur de pas, la distance journalière maximale, la sensibilité aux barrières et un niveau d'exploration — calibrés à partir de la littérature publiée sur les domaines vitaux et la dispersion.",
    "about.s2.title": "2 · Qualité de l'habitat",
    "about.s2.body":
      "Un champ procédural continu et déterministe (gradient sin/cos lissé, initialisé sur les coordonnées) sert de proxy pour la qualité de l'habitat en l'absence d'une couche mondiale d'occupation des sols. Les valeurs vont de 0 à 1 et orientent la marche vers les pixels de forte qualité.",
    "about.s3.title": "3 · Barrières réelles (OpenStreetMap)",
    "about.s3.body.1":
      "À chaque exécution, nous interrogeons l'API Overpass en temps réel autour du point de départ et récupérons trois classes d'objets : ",
    "about.s3.roads": "routes principales",
    "about.s3.mid1": ", ",
    "about.s3.water": "rivières et plans d'eau",
    "about.s3.mid2": " et ",
    "about.s3.urban": "occupation du sol urbaine / bâtie",
    "about.s3.body.2":
      ". Les résultats sont mis en cache 30 min en mémoire. Chaque pas candidat est pénalisé par la proximité des barrières voisines, pondérée par la sensibilité de l'espèce.",
    "about.s4.title": "4 · Marche aléatoire corrélée biaisée",
    "about.s4.body.1":
      "À chaque pas, le simulateur tire 8 mouvements candidats autour du cap actuel. Chaque candidat est noté par :",
    "about.s4.body.2":
      "L'un des meilleurs candidats est sélectionné (légèrement stochastique). Les poids proviennent du profil d'espèce : un loup file ainsi en longues séquences corrélées tandis qu'une tortue tourne en boucles serrées. Le PRNG est initialisé (mulberry32) afin que les mêmes entrées reproduisent toujours le même trajet.",
    "about.s5.title": "5 · Cadence temporelle",
    "about.s5.body":
      "Le nombre de pas est plafonné par la distance journalière maximale de l'espèce et par la durée de simulation (max 400 points). Les horodatages sont répartis uniformément sur la fenêtre demandée.",
    "about.limits.title": "Limites et réserves honnêtes",
    "about.limits.1": "Le champ d'habitat est procédural, et non une occupation réelle des sols.",
    "about.limits.2": "Les barrières OSM sont collaboratives ; les zones rurales peuvent être clairsemées.",
    "about.limits.3": "Pas de météo, pas de saison, pas de comportement interindividuel.",
    "about.limits.4":
      "Le résultat est illustratif — ne l'utilisez jamais comme preuve du chemin réel d'un animal.",

    // --- Player ---
    "player.speed": "Vitesse",
    "player.photo": "Photo {n}",

    // --- Right panel / context ---
    "ctx.candidateContext": "Contexte candidat",
    "ctx.ecologyReadout": "Lecture écologique",
    "ctx.findImagery": "Trouver l'imagerie de contexte",
    "ctx.searching": "Recherche…",
    "ctx.noPhotos":
      "Aucune photo géolocalisée trouvée près de ce trajet. De nombreux corridors sauvages ont peu ou pas d'imagerie publique — essayez un rayon de recherche plus large ou un autre individu.",
    "ctx.imagesFound": "{count} image de contexte trouvée le long du trajet.",
    "ctx.imagesFoundPlural": "{count} images de contexte trouvées le long du trajet.",
    "ctx.candidateAlt": "Contexte candidat",
    "ctx.noPreview": "Aucun aperçu d'image",
    "ctx.prevPhoto": "Photo précédente",
    "ctx.nextPhoto": "Photo suivante",
    "ctx.prev": "Préc.",
    "ctx.next": "Suiv.",
    "ctx.confidence": "Confiance",
    "ctx.distance": "Distance",
    "ctx.meters": "{count} mètres",
    "ctx.imageDate": "Date de l'image",
    "ctx.scanPrompt": "Lancez le trajet pour scanner le contexte visuel proche",
    "ctx.loadPrompt": "Chargez un trajet pour commencer",
    "ctx.throughEyes": "À travers les yeux du {name}",
    "ctx.throughEyesFallback": "À travers ses yeux",
    "ctx.readingScene": "Lecture de la scène…",
    "ctx.sceneError": "Impossible d'interpréter cette scène.",
    "ctx.aiInterpretation":
      "Interprétation par IA de l'imagerie au sol à moins de {count} mètres du trajet — une lecture imaginée du terrain, et non la vue exacte de l'animal.",

    // --- Ecology readout (sim) ---
    "eco.habitatScore": "Score d'habitat",
    "eco.barrierRisk": "Risque de barrière",
    "eco.step":
      "Pas {current} sur {total}. L'habitat dérive d'un gradient procédural de qualité ; le risque de barrière utilise les routes, plans d'eau et zones bâties OpenStreetMap en temps réel près du point de départ.",
    "eco.generatePrompt": "Générez un trajet pour voir l'écologie",
    "eco.placePrompt": "Placez un individu sur la carte pour commencer",

    // --- Weather ---
    "weather.title": "Météo au passage du {name}",
    "weather.titleFallback": "Météo au passage de l'animal",
    "weather.date": "Date",
    "weather.wind": "Vent",
    "weather.precip": "Précipitations",
    "weather.windTip": "vent {value} km/h",
    "weather.precipTip": "précip. {value} mm",
    "weather.source":
      "Données de réanalyse ERA5 (Open-Meteo) à l'heure et au lieu exacts du passage.",

    // --- Barriers ---
    "barrier.title": "Rupture de continuité",
    "barrier.type": "Type",
    "barrier.detail": "Détail",
    "barrier.distance": "Distance",
    "barrier.note":
      "Infrastructure humaine la plus proche (OpenStreetMap) — obstacle potentiel à la libre circulation de l'animal.",

    // --- Barrier kind labels ---
    "barrier.kind.highway": "Route",
    "barrier.kind.railway": "Voie ferrée",
    "barrier.kind.water": "Cours d'eau",
    "barrier.kind.urban": "Zone urbanisée",

    // --- Barrier subtype labels ---
    "barrier.sub.motorway": "Autoroute",
    "barrier.sub.trunk": "Voie rapide",
    "barrier.sub.primary": "Route principale",
    "barrier.sub.secondary": "Route secondaire",
    "barrier.sub.tertiary": "Route locale",
    "barrier.sub.rail": "Voie ferrée",
    "barrier.sub.light_rail": "Train léger",
    "barrier.sub.narrow_gauge": "Voie étroite",
    "barrier.sub.river": "Rivière",
    "barrier.sub.canal": "Canal",
    "barrier.sub.water": "Plan d'eau",
    "barrier.sub.residential": "Zone résidentielle",
    "barrier.sub.industrial": "Zone industrielle",
    "barrier.sub.commercial": "Zone commerciale",

    // --- Landing ---
    "landing.docTitle": "AnimalView — Sur les traces d'un animal sauvage",
    "landing.openMap": "Ouvrir la carte →",
    "landing.kicker": "Télémétrie faune · inspiré de Bear\u00a071",
    "landing.heroTitle.1": "Marchez sur les traces",
    "landing.heroTitle.2": "d'un animal sauvage.",
    "landing.heroBody":
      "AnimalView reconstitue le voyage d'un animal à partir de son trajet GPS réel : imagerie au sol, météo du moment, pression humaine et barrières du paysage — pour voir le monde tel qu'il a pu le traverser.",
    "landing.enterMap": "Entrer dans la carte",
    "landing.realDataOnly": "Données réelles uniquement",
    "landing.featuresTitle": "Ce que fait l'outil",
    "landing.howTitle": "Comment ça marche",
    "landing.ethosTitle": "Rien n'est inventé",
    "landing.ethosBody":
      "AnimalView ne sert que des données réelles : trajets de mouvement publics, imagerie au sol existante et objets OpenStreetMap. Lorsqu'aucune donnée réelle n'existe pour un lieu, l'app n'affiche rien plutôt que d'inventer. Le mode simulation est clairement signalé comme hypothétique.",
    "landing.ctaTitle": "Prêt à suivre la piste ?",
    "landing.footer": "AnimalView · une approximation spatiale inspirée de Bear\u00a071",

    "landing.feature.replay.title": "Rejouer le trajet",
    "landing.feature.replay.body":
      "Suivez le parcours GPS réel d'un animal sur une carte sombre ou satellite, avec une timeline et une vitesse réglable.",
    "landing.feature.visual.title": "Contexte visuel",
    "landing.feature.visual.body":
      "À chaque point du trajet, l'app affiche de vraies photos au sol (Mapillary, Street View) proches de la position — ce que l'animal aurait pu voir.",
    "landing.feature.pressure.title": "Pression humaine",
    "landing.feature.pressure.body":
      "Une heatmap dérivée d'OpenStreetMap révèle sentiers, routes, remontées, refuges et zones bâties qui croisent les déplacements de l'animal.",
    "landing.feature.corridor.title": "Corridor de 1 km",
    "landing.feature.corridor.body":
      "Un tampon d'un kilomètre matérialise la bande réellement traversée par l'animal et y restreint les données de présence humaine.",
    "landing.feature.sim.title": "Mode simulation",
    "landing.feature.sim.body":
      "Explorez des trajets plausibles générés sur un gradient d'habitat, avec barrières paysagères et lecture de l'obstacle le plus proche.",
    "landing.feature.weather.title": "Météo & analyse",
    "landing.feature.weather.body":
      "Conditions météo de réanalyse à l'heure et au lieu exacts du passage, et analyse de l'imagerie le long du parcours.",

    "landing.step.1.title": "Choisir un animal",
    "landing.step.1.body":
      "Sélectionnez une espèce, une étude de mouvement et un individu suivi parmi des jeux de données réels (ex. bouquetin alcotra-lemed-ibex, dispersion du loup Slavc).",
    "landing.step.2.title": "Dérouler le voyage",
    "landing.step.2.body":
      "Lancez la lecture animée du trajet et laissez le panneau de contexte reconstruire l'environnement traversé, point par point.",
    "landing.step.3.title": "Lire le paysage",
    "landing.step.3.body":
      "Croisez imagerie au sol, météo, pression humaine et barrières pour comprendre ce que l'animal a rencontré sur son chemin.",
  },
  en: {
    // --- Generic / controls ---
    "controls.show": "Show controls",
    "controls.hide": "Hide controls",
    "controls.label": "Controls",
    "controls.species": "Species",
    "controls.study": "Study",
    "controls.dataSource": "Data source",
    "controls.individual": "Individual",
    "controls.searchRadius": "Search Radius",
    "controls.duration": "Duration",
    "controls.startLocation": "Start Location",
    "controls.selectSpecies": "Select species...",
    "controls.selectStudy": "Select study...",
    "controls.selectIndividual": "Select individual...",
    "controls.loadTrack": "Load Track",
    "controls.humanPressure": "Human Pressure",
    "controls.humanPressureHeatmap": "Human Pressure Heatmap",
    "controls.humanPressureHint":
      "Overlay potential human presence — trails, lifts, huts, roads & settlements (OpenStreetMap).",
    "controls.humanPressureHintSim":
      "Density of roads & built-up areas (OSM). Generate a track first to populate the data.",
    "controls.durationWeek": "1 week",
    "controls.durationMonth": "1 month",
    "controls.placeIndividual": "Place individual",
    "controls.replaceIndividual": "Re-place individual",
    "controls.clickOnMap": "Click on map…",
    "controls.generateTrack": "Generate Track",
    "controls.simulating": "Simulating…",
    "controls.points": "Points",
    "controls.osmBarriers": "OSM barriers",
    "controls.id": "ID",
    "controls.simFailed": "Simulation failed: {msg}",

    // --- Mode toggle ---
    "mode.real": "Real Tracks",
    "mode.sim": "Simulation",
    "mode.subtitleReal": "Reconstructing paths",
    "mode.subtitleSim": "Synthetic paths",

    // --- Basemap / theme / language ---
    "basemap.dark": "Dark",
    "basemap.satellite": "Satellite",
    "theme.toLight": "Switch to light mode",
    "theme.toDark": "Switch to dark mode",

    // --- Disclaimers ---
    "disclaimer.sim.prefix": "These are ",
    "disclaimer.sim.highlight": "simulated plausible movements",
    "disclaimer.sim.suffix":
      ", not observed animal locations. Generated via biased random walk over a habitat gradient and live OpenStreetMap barriers.",
    "disclaimer.real":
      "AnimalView reconstructs possible visual encounters along animal movement tracks. This is not proof of what the animal saw — it is a spatial approximation using public street-level imagery near recorded GPS points.",
    "banner.simMovements":
      "Simulated plausible movements · not observed animal locations",
    "banner.placeIndividual": "Click anywhere on the map to drop the individual",

    // --- About dialog ---
    "about.aria": "About this simulation",
    "about.button": "About",
    "about.title": "TaxonPath — Simulation Method",
    "about.intro.1": "TaxonPath generates ",
    "about.intro.plausible": "plausible",
    "about.intro.2":
      " animal trajectories — not predictions, not observations. The goal is to illustrate how a given species ",
    "about.intro.might": "might",
    "about.intro.3":
      " move through a landscape given its ecology and the real human barriers around it.",
    "about.s1.title": "1 · Species profiles",
    "about.s1.body":
      "Five hand-tuned profiles (red fox, roe deer, Hermann's tortoise, wild boar, grey wolf). Each profile encodes step length, max daily distance, barrier sensitivity, and an exploration level — calibrated from published home-range and dispersal literature.",
    "about.s2.title": "2 · Habitat suitability",
    "about.s2.body":
      "A continuous, deterministic procedural field (smooth sin/cos gradient seeded on coordinates) acts as a proxy for habitat quality in the absence of a global land-cover layer. Values range 0–1 and bias the walk toward high-suitability pixels.",
    "about.s3.title": "3 · Real-world barriers (OpenStreetMap)",
    "about.s3.body.1":
      "For each run we query the live Overpass API around the start point and pull three feature classes: ",
    "about.s3.roads": "major roads",
    "about.s3.mid1": ", ",
    "about.s3.water": "rivers & water bodies",
    "about.s3.mid2": ", and ",
    "about.s3.urban": "urban / built-up land use",
    "about.s3.body.2":
      ". Results are cached 30 min in memory. Each candidate step is penalized by proximity to nearby barriers, weighted by the species' sensitivity.",
    "about.s4.title": "4 · Biased correlated random walk",
    "about.s4.body.1":
      "At every step the simulator draws 8 candidate moves around the current heading. Each candidate is scored by:",
    "about.s4.body.2":
      "One of the top candidates is selected (slightly stochastic). Weights come from the species profile, so a wolf cruises in long correlated bouts while a tortoise tumbles in tight loops. The PRNG is seeded (mulberry32) so the same inputs always reproduce the same track.",
    "about.s5.title": "5 · Timing",
    "about.s5.body":
      "Step count is capped by the species' max daily distance and by simulation duration (max 400 points). Timestamps are spaced evenly across the requested window.",
    "about.limits.title": "Limits & honest caveats",
    "about.limits.1": "The habitat field is procedural, not real land-cover.",
    "about.limits.2": "OSM barriers are crowd-sourced; rural areas may be sparse.",
    "about.limits.3": "No weather, no season, no inter-individual behaviour.",
    "about.limits.4":
      "Output is illustrative — never use it as evidence of where a real animal went.",

    // --- Player ---
    "player.speed": "Speed",
    "player.photo": "Photo {n}",

    // --- Right panel / context ---
    "ctx.candidateContext": "Candidate Context",
    "ctx.ecologyReadout": "Ecology Readout",
    "ctx.findImagery": "Find Context Imagery",
    "ctx.searching": "Searching...",
    "ctx.noPhotos":
      "No geotagged photos found near this track. Many wild corridors have little or no public imagery — try a larger search radius or a different individual.",
    "ctx.imagesFound": "{count} context image found along the track.",
    "ctx.imagesFoundPlural": "{count} context images found along the track.",
    "ctx.candidateAlt": "Candidate context",
    "ctx.noPreview": "No Image Preview",
    "ctx.prevPhoto": "Previous photo",
    "ctx.nextPhoto": "Next photo",
    "ctx.prev": "Prev",
    "ctx.next": "Next",
    "ctx.confidence": "Confidence",
    "ctx.distance": "Distance",
    "ctx.meters": "{count} meters",
    "ctx.imageDate": "Image Date",
    "ctx.scanPrompt": "Play track to scan for nearby visual context",
    "ctx.loadPrompt": "Load a track to begin",
    "ctx.throughEyes": "Through the {name}'s eyes",
    "ctx.throughEyesFallback": "Through its eyes",
    "ctx.readingScene": "Reading the scene…",
    "ctx.sceneError": "Could not interpret this scene.",
    "ctx.aiInterpretation":
      "AI interpretation of nearby street-level imagery within {count} meters of the track — an imagined reading of the terrain, not the exact animal view.",

    // --- Ecology readout (sim) ---
    "eco.habitatScore": "Habitat score",
    "eco.barrierRisk": "Barrier risk",
    "eco.step":
      "Step {current} of {total}. Habitat is derived from a procedural suitability gradient; barrier risk uses live OpenStreetMap roads, water and built-up areas near the start point.",
    "eco.generatePrompt": "Generate a track to see ecology",
    "eco.placePrompt": "Place an individual on the map to begin",

    // --- Weather ---
    "weather.title": "Weather as the {name} passed",
    "weather.titleFallback": "Weather as the animal passed",
    "weather.date": "Date",
    "weather.wind": "Wind",
    "weather.precip": "Precipitation",
    "weather.windTip": "wind {value} km/h",
    "weather.precipTip": "precip {value} mm",
    "weather.source":
      "ERA5 reanalysis data (Open-Meteo) at the exact time and place of passage.",

    // --- Barriers ---
    "barrier.title": "Continuity break",
    "barrier.type": "Type",
    "barrier.detail": "Detail",
    "barrier.distance": "Distance",
    "barrier.note":
      "Nearest human infrastructure (OpenStreetMap) — a potential obstacle to the animal's free movement.",

    // --- Barrier kind labels ---
    "barrier.kind.highway": "Road",
    "barrier.kind.railway": "Railway",
    "barrier.kind.water": "Waterway",
    "barrier.kind.urban": "Built-up area",

    // --- Barrier subtype labels ---
    "barrier.sub.motorway": "Motorway",
    "barrier.sub.trunk": "Trunk road",
    "barrier.sub.primary": "Primary road",
    "barrier.sub.secondary": "Secondary road",
    "barrier.sub.tertiary": "Local road",
    "barrier.sub.rail": "Railway",
    "barrier.sub.light_rail": "Light rail",
    "barrier.sub.narrow_gauge": "Narrow gauge",
    "barrier.sub.river": "River",
    "barrier.sub.canal": "Canal",
    "barrier.sub.water": "Water body",
    "barrier.sub.residential": "Residential area",
    "barrier.sub.industrial": "Industrial area",
    "barrier.sub.commercial": "Commercial area",

    // --- Landing ---
    "landing.docTitle": "AnimalView — On the trail of a wild animal",
    "landing.openMap": "Open the map →",
    "landing.kicker": "Wildlife telemetry · inspired by Bear\u00a071",
    "landing.heroTitle.1": "Walk in the footsteps",
    "landing.heroTitle.2": "of a wild animal.",
    "landing.heroBody":
      "AnimalView reconstructs an animal's journey from its real GPS track: street-level imagery, the weather of the moment, human pressure and landscape barriers — to see the world as it may have crossed it.",
    "landing.enterMap": "Enter the map",
    "landing.realDataOnly": "Real data only",
    "landing.featuresTitle": "What the tool does",
    "landing.howTitle": "How it works",
    "landing.ethosTitle": "Nothing is invented",
    "landing.ethosBody":
      "AnimalView only serves real data: public movement tracks, existing street-level imagery and OpenStreetMap objects. When no real data exists for a place, the app shows nothing rather than inventing it. The simulation mode is clearly flagged as hypothetical.",
    "landing.ctaTitle": "Ready to follow the trail?",
    "landing.footer": "AnimalView · a spatial approximation inspired by Bear\u00a071",

    "landing.feature.replay.title": "Replay the track",
    "landing.feature.replay.body":
      "Follow an animal's real GPS path on a dark or satellite map, with a timeline and adjustable speed.",
    "landing.feature.visual.title": "Visual context",
    "landing.feature.visual.body":
      "At each point along the track, the app shows real ground-level photos (Mapillary, Street View) near the position — what the animal might have seen.",
    "landing.feature.pressure.title": "Human pressure",
    "landing.feature.pressure.body":
      "An OpenStreetMap-derived heatmap reveals trails, roads, lifts, huts and built-up areas that cross the animal's movements.",
    "landing.feature.corridor.title": "1 km corridor",
    "landing.feature.corridor.body":
      "A one-kilometre buffer materialises the band the animal actually crossed and restricts the human-presence data to it.",
    "landing.feature.sim.title": "Simulation mode",
    "landing.feature.sim.body":
      "Explore plausible tracks generated over a habitat gradient, with landscape barriers and a readout of the nearest obstacle.",
    "landing.feature.weather.title": "Weather & analysis",
    "landing.feature.weather.body":
      "Reanalysis weather conditions at the exact time and place of passage, plus analysis of the imagery along the route.",

    "landing.step.1.title": "Choose an animal",
    "landing.step.1.body":
      "Select a species, a movement study and a tracked individual from real datasets (e.g. alcotra-lemed-ibex ibex, Slavc wolf dispersal).",
    "landing.step.2.title": "Unfold the journey",
    "landing.step.2.body":
      "Start the animated playback of the track and let the context panel reconstruct the environment crossed, point by point.",
    "landing.step.3.title": "Read the landscape",
    "landing.step.3.body":
      "Cross-reference ground imagery, weather, human pressure and barriers to understand what the animal encountered on its way.",
  },
};

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "fr" || saved === "en") return saved;
    }
    return "fr";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const value = useMemo<LanguageContextValue>(() => {
    const t = (key: string, vars?: Record<string, string | number>) => {
      const str =
        translations[lang][key] ?? translations.fr[key] ?? key;
      return interpolate(str, vars);
    };
    return { lang, setLang, t };
  }, [lang]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLang must be used within a LanguageProvider");
  }
  return ctx;
}
