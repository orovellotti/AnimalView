import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Footprints,
  Camera,
  Activity,
  CircleDashed,
  Crosshair,
  CloudSun,
  ArrowRight,
  MapPin,
  ShieldCheck,
} from "lucide-react";

const features = [
  {
    icon: Footprints,
    title: "Rejouer le trajet",
    body: "Suivez le parcours GPS réel d'un animal sur une carte sombre ou satellite, avec une timeline et une vitesse réglable.",
  },
  {
    icon: Camera,
    title: "Contexte visuel",
    body: "À chaque point du trajet, l'app affiche de vraies photos au sol (Mapillary, Street View) proches de la position — ce que l'animal aurait pu voir.",
  },
  {
    icon: Activity,
    title: "Pression humaine",
    body: "Une heatmap dérivée d'OpenStreetMap révèle sentiers, routes, remontées, refuges et zones bâties qui croisent les déplacements de l'animal.",
  },
  {
    icon: CircleDashed,
    title: "Corridor de 1 km",
    body: "Un tampon d'un kilomètre matérialise la bande réellement traversée par l'animal et y restreint les données de présence humaine.",
  },
  {
    icon: Crosshair,
    title: "Mode simulation",
    body: "Explorez des trajets plausibles générés sur un gradient d'habitat, avec barrières paysagères et lecture de l'obstacle le plus proche.",
  },
  {
    icon: CloudSun,
    title: "Météo & analyse",
    body: "Conditions météo de réanalyse à l'heure et au lieu exacts du passage, et analyse de l'imagerie le long du parcours.",
  },
];

const steps = [
  {
    n: "01",
    title: "Choisir un animal",
    body: "Sélectionnez une espèce, une étude de mouvement et un individu suivi parmi des jeux de données réels (ex. bouquetin alcotra-lemed-ibex, dispersion du loup Slavc).",
  },
  {
    n: "02",
    title: "Dérouler le voyage",
    body: "Lancez la lecture animée du trajet et laissez le panneau de contexte reconstruire l'environnement traversé, point par point.",
  },
  {
    n: "03",
    title: "Lire le paysage",
    body: "Croisez imagerie au sol, météo, pression humaine et barrières pour comprendre ce que l'animal a rencontré sur son chemin.",
  },
];

export default function Landing() {
  const [theme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("animalview-theme");
      if (saved === "light" || saved === "dark") return saved;
    }
    return "dark";
  });

  useEffect(() => {
    document.title = "AnimalView — Sur les traces d'un animal sauvage";
  }, []);

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="relative min-h-screen w-full overflow-x-hidden bg-background text-foreground">
        {/* Ambient backdrop */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            background:
              "radial-gradient(900px 600px at 78% -8%, rgba(234,179,8,0.16), transparent 60%), radial-gradient(700px 500px at 8% 12%, rgba(103,232,249,0.08), transparent 55%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(circle at 50% 30%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(circle at 50% 30%, black, transparent 75%)",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-24">
          {/* Header */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-primary">
              <MapPin className="h-4 w-4" />
              AnimalView
            </div>
            <Link
              href="/explore"
              className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              Ouvrir la carte →
            </Link>
          </header>

          {/* Hero */}
          <section className="mt-20 sm:mt-28">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
              Télémétrie faune · inspiré de Bear&nbsp;71
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Marchez sur les traces
              <br />
              d'un animal sauvage.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              AnimalView reconstitue le voyage d'un animal à partir de son trajet GPS réel : imagerie au
              sol, météo du moment, pression humaine et barrières du paysage — pour voir le monde tel
              qu'il a pu le traverser.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/explore"
                className="group inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 font-mono text-xs uppercase tracking-widest text-primary-foreground transition-all hover:opacity-90"
              >
                Entrer dans la carte
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
                Données réelles uniquement
              </div>
            </div>
          </section>

          {/* Features */}
          <section className="mt-24">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Ce que fait l'outil
            </h2>
            <div className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="bg-background p-6 transition-colors hover:bg-foreground/[0.03]">
                  <f.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-4 text-sm font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How it works */}
          <section className="mt-24">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Comment ça marche
            </h2>
            <div className="mt-6 grid gap-8 sm:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n}>
                  <div className="font-mono text-2xl font-semibold text-primary/40">{s.n}</div>
                  <h3 className="mt-3 text-sm font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Ethos */}
          <section className="mt-24 rounded-sm border border-primary/20 bg-primary/[0.04] p-8">
            <div className="flex items-start gap-4">
              <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Rien n'est inventé</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  AnimalView ne sert que des données réelles : trajets de mouvement publics, imagerie au
                  sol existante et objets OpenStreetMap. Lorsqu'aucune donnée réelle n'existe pour un lieu,
                  l'app n'affiche rien plutôt que d'inventer. Le mode simulation est clairement signalé
                  comme hypothétique.
                </p>
              </div>
            </div>
          </section>

          {/* CTA footer */}
          <section className="mt-24 flex flex-col items-center text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Prêt à suivre la piste ?
            </h2>
            <Link
              href="/explore"
              className="group mt-8 inline-flex items-center gap-2 rounded-sm bg-primary px-7 py-3 font-mono text-xs uppercase tracking-widest text-primary-foreground transition-all hover:opacity-90"
            >
              Entrer dans la carte
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="mt-12 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
              AnimalView · une approximation spatiale inspirée de Bear&nbsp;71
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
