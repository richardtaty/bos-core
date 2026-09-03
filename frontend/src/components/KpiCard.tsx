interface Props {
  titulo: string;
  valor: number | string;
  subtitulo?: string;
  color?: "primary" | "success" | "warning" | "danger" | "neutral";
  icono?: string;
}

const colores = {
  primary: "bg-primary-50 border-primary-200 text-primary-700",
  success: "bg-success-50 border-success-200 text-success-700",
  warning: "bg-warning-50 border-warning-200 text-warning-700",
  danger: "bg-danger-50 border-danger-200 text-danger-700",
  neutral: "bg-neutral-50 border-neutral-200 text-neutral-700",
};

export function KpiCard({ titulo, valor, subtitulo, color = "neutral", icono }: Props) {
  return (
    <div className={`rounded-xl p-4 border ${colores[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icono && <span className="text-lg">{icono}</span>}
        <p className="text-xs font-medium opacity-80">{titulo}</p>
      </div>
      <p className="text-2xl font-semibold">{valor}</p>
      {subtitulo && <p className="text-xs mt-1 opacity-75">{subtitulo}</p>}
    </div>
  );
}
