import dynamic from "next/dynamic";

const TenisApp = dynamic(() => import("@/components/ui/TenisApp"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <p>Cargando...</p>
    </div>
  ),
});

export default function Home() {
  return <TenisApp />;
}
