"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import CitasLista from "@/components/barbero/CitasLista";
import Calendario from "@/components/barbero/Calendario";
import CitaManual from "@/components/barbero/CitaManual";
import ConfigHorario from "@/components/barbero/ConfigHorario";
import ResumenDiario from "@/components/barbero/ResumenDiario";
import ActivarNotificaciones from "@/components/ActivarNotificaciones";

const TABS = [
  { key: "calendario", label: "Calendario" },
  { key: "lista",      label: "Hoy" },
  { key: "manual",     label: "Manual" },
  { key: "resumen",    label: "Resumen" },
  { key: "config",     label: "Config" },
];

export default function PanelBarberoPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [tab, setTab] = useState("calendario");
  const [refresh, setRefresh] = useState(0);
  const [irACitaFecha, setIrACitaFecha] = useState(null);
  // Fecha y hora que el barbero elige desde el Calendario para agendar manual.
  const [prefillManual, setPrefillManual] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.session || d.session.role !== "barbero") {
          router.replace("/barbero/login");
          setSesion(null);
        } else if (d.session.passwordTemporal) {
          router.replace("/barbero/cambiar-password");
        } else {
          setSesion(d.session);
        }
      });
  }, [router]);

  useEffect(() => {
    if (!sesion) return;
    fetch("/api/barbero/perfil")
      .then((r) => r.json())
      .then((d) => setPerfil(d.barbero));
  }, [sesion, refresh]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  if (sesion === undefined) return <div className="p-10 text-center text-barber-gray">Cargando…</div>;
  if (!sesion) return null;

  const recargar = () => setRefresh((r) => r + 1);

  return (
    <div className="min-h-screen">
      <Header>
        <span className="text-white/70 hidden sm:inline text-sm">{perfil?.local}</span>
        <button onClick={logout} className="text-white/80 hover:text-white font-semibold text-sm px-3 py-2 rounded-lg hover:bg-white/10 transition min-h-[44px]">
          Salir
        </button>
      </Header>

      <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
        <h1 className="font-display text-2xl sm:text-3xl">Hola, {sesion.nombre.split(" ")[0]} 👋</h1>

        <div className="mt-4">
          <ActivarNotificaciones descripcion="Recibí un aviso apenas un cliente te solicite una cita, aunque tengas la app cerrada." />
        </div>

        <div className="mt-3 sm:mt-4 flex overflow-x-auto overflow-y-hidden border-b border-black/10 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setPrefillManual(null); setTab(t.key); }}
              className={`px-2.5 sm:px-4 py-2.5 font-semibold whitespace-nowrap border-b-2 -mb-px flex-auto shrink-0 sm:flex-none ${tab === t.key ? "border-barber-red text-barber-red" : "border-transparent text-barber-gray hover:text-barber-ink"}`}
            >
              <span className="text-sm sm:text-base">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "lista" && <CitasLista onCambio={recargar} />}
          {tab === "calendario" && (
            <Calendario
              perfil={perfil}
              diaInicial={irACitaFecha}
              onAgendarManual={(fecha, hora) => { setPrefillManual({ fecha, hora }); setTab("manual"); }}
            />
          )}
          {tab === "manual" && perfil && (
            <CitaManual
              planes={perfil.planes}
              prefill={prefillManual}
              onCreada={() => { setPrefillManual(null); setTab("lista"); }}
            />
          )}
          {tab === "resumen" && <ResumenDiario />}
          {tab === "config" && perfil && (
            <ConfigHorario
              perfil={perfil}
              onGuardado={recargar}
              onIrACita={(fecha) => { setIrACitaFecha(fecha); setTab("calendario"); }}
            />
          )}
        </div>

        <p className="mt-8 text-center text-xs text-barber-gray">
          <Link href="/" className="underline">Ver sitio público</Link>
        </p>
      </main>
    </div>
  );
}
