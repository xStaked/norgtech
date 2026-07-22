import type { ReactNode } from "react";

const FLAME_BAR =
  "linear-gradient(90deg,#00a651,#a7ce39,#0288c4,#ffcb06,#f58221,#ee1c25)";

type Stat = { value: string; label: string };

export function AuthShell({
  headline,
  blurb,
  stats,
  glow = "accent",
  children,
}: {
  headline: ReactNode;
  blurb: string;
  stats?: Stat[];
  glow?: "accent" | "success";
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen bg-white">
      {/* Panel de marca */}
      <div className="relative hidden w-[520px] shrink-0 flex-col overflow-hidden bg-[linear-gradient(160deg,#0c2c44_0%,#0a2238_55%,#091d30_100%)] px-11 py-10 text-white lg:flex">
        <div
          className="absolute -top-[90px] -right-[120px] size-[340px] rounded-full"
          style={{
            background: `radial-gradient(circle,${glow === "success" ? "rgba(0,166,81,.18)" : "rgba(46,163,218,.20)"},transparent 70%)`,
          }}
        />
        <div
          className="absolute -bottom-[60px] -left-20 size-[260px] rounded-full"
          style={{
            background: `radial-gradient(circle,${glow === "success" ? "rgba(46,163,218,.14)" : "rgba(0,166,81,.14)"},transparent 70%)`,
          }}
        />

        <div className="relative w-[190px]">
          {/* ponytail: mismo logo/fondo blanco que el sidebar (el webp no es transparente) */}
          <div className="rounded-[10px] bg-white px-3 py-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/norgtech-wordmark.webp"
              alt="Norgtech — Tecnologías en nutrición orgánica"
              className="h-auto w-full object-contain"
            />
          </div>
          <div className="mt-2 text-center text-[10px] font-semibold tracking-[0.05em] text-[#7fa9c4]">
            ERP COMERCIAL
          </div>
        </div>

        <div className="relative mt-auto">
          <div
            className="mb-[22px] h-[3px] w-20 rounded-sm"
            style={{ background: FLAME_BAR }}
          />
          <h2 className="text-[30px] leading-[1.18] font-extrabold tracking-[-0.025em]">
            {headline}
          </h2>
          <p className="mt-3.5 max-w-[380px] text-sm leading-[1.6] text-[#aec5d6]">
            {blurb}
          </p>
          {stats ? (
            <div className="mt-[30px] flex gap-[26px]">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-[22px] font-extrabold tabular-nums">
                    {stat.value}
                  </div>
                  <div className="text-[11.5px] text-[#7fa9c4]">{stat.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Formulario */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </main>
  );
}
