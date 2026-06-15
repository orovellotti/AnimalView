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
import { useLang, type Lang } from "@/lib/i18n";

const features = [
  { icon: Footprints, titleKey: "landing.feature.replay.title", bodyKey: "landing.feature.replay.body" },
  { icon: Camera, titleKey: "landing.feature.visual.title", bodyKey: "landing.feature.visual.body" },
  { icon: Activity, titleKey: "landing.feature.pressure.title", bodyKey: "landing.feature.pressure.body" },
  { icon: CircleDashed, titleKey: "landing.feature.corridor.title", bodyKey: "landing.feature.corridor.body" },
  { icon: Crosshair, titleKey: "landing.feature.sim.title", bodyKey: "landing.feature.sim.body" },
  { icon: CloudSun, titleKey: "landing.feature.weather.title", bodyKey: "landing.feature.weather.body" },
];

const steps = [
  { n: "01", titleKey: "landing.step.1.title", bodyKey: "landing.step.1.body" },
  { n: "02", titleKey: "landing.step.2.title", bodyKey: "landing.step.2.body" },
  { n: "03", titleKey: "landing.step.3.title", bodyKey: "landing.step.3.body" },
];

export default function Landing() {
  const { lang, setLang, t } = useLang();

  const [theme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("animalview-theme");
      if (saved === "light" || saved === "dark") return saved;
    }
    return "dark";
  });

  useEffect(() => {
    document.title = t("landing.docTitle");
  }, [t]);

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
            <div className="flex items-center gap-3">
              <div className="flex border border-border rounded-sm overflow-hidden">
                {(["fr", "en"] as Lang[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={`px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                      lang === l
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <Link
                href="/explore"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("landing.openMap")}
              </Link>
            </div>
          </header>

          {/* Hero */}
          <section className="mt-20 sm:mt-28">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
              {t("landing.kicker")}
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              {t("landing.heroTitle.1")}
              <br />
              {t("landing.heroTitle.2")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("landing.heroBody")}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/explore"
                className="group inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 font-mono text-xs uppercase tracking-widest text-primary-foreground transition-all hover:opacity-90"
              >
                {t("landing.enterMap")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
                {t("landing.realDataOnly")}
              </div>
            </div>
          </section>

          {/* Features */}
          <section className="mt-24">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {t("landing.featuresTitle")}
            </h2>
            <div className="mt-6 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.titleKey} className="bg-background p-6 transition-colors hover:bg-foreground/[0.03]">
                  <f.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-4 text-sm font-semibold tracking-tight">{t(f.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(f.bodyKey)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How it works */}
          <section className="mt-24">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {t("landing.howTitle")}
            </h2>
            <div className="mt-6 grid gap-8 sm:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n}>
                  <div className="font-mono text-2xl font-semibold text-primary/40">{s.n}</div>
                  <h3 className="mt-3 text-sm font-semibold tracking-tight">{t(s.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(s.bodyKey)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Ethos */}
          <section className="mt-24 rounded-sm border border-primary/20 bg-primary/[0.04] p-8">
            <div className="flex items-start gap-4">
              <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <div>
                <h3 className="text-sm font-semibold tracking-tight">{t("landing.ethosTitle")}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {t("landing.ethosBody")}
                </p>
              </div>
            </div>
          </section>

          {/* CTA footer */}
          <section className="mt-24 flex flex-col items-center text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("landing.ctaTitle")}
            </h2>
            <Link
              href="/explore"
              className="group mt-8 inline-flex items-center gap-2 rounded-sm bg-primary px-7 py-3 font-mono text-xs uppercase tracking-widest text-primary-foreground transition-all hover:opacity-90"
            >
              {t("landing.enterMap")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="mt-12 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
              {t("landing.footer")}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
