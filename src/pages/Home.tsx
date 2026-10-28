import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  CheckCircle2,
  CalendarCheck,
  UserX,
  Clock,
} from 'lucide-react';
import { isToday, isAfter, isSameMonth, isSameYear, parseISO, startOfToday } from 'date-fns';
import type { ConsultaStatus } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConsultaMTRow {
  id: string;
  data: string;
  hora: string | null;
  status: ConsultaStatus;
  funcionarios_mt: { nome: string | null; numero_funcionario: string | number | null } | null;
}

interface ChartPoint {
  semana: string;
  concluidas: number;
  faltas: number;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const KPI_CONFIG = [
  { key: 'realizadosAno', label: 'Exames Anuais (Concluídos)', icon: CheckCircle2, iconColor: 'text-[#4CAF50]' },
  { key: 'concluidosMes', label: 'Concluídos (Mês)', icon: CalendarCheck, iconColor: 'text-[#0D3B3F] dark:text-[#5CB85C]' },
  { key: 'faltasMes', label: 'Faltas (Mês)', icon: UserX, iconColor: 'text-red-500' },
  { key: 'proximosAgendamentos', label: 'Próximos Agendamentos', icon: Clock, iconColor: 'text-[#1E4D2B] dark:text-[#8BC34A]' },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />
);

const formatDate = () => new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 19) return 'Boa tarde';
  return 'Boa noite';
};

// Converte 'YYYY-MM-DD' (ou ISO com hora) para Date à meia-noite LOCAL.
// (new Date('YYYY-MM-DD') interpreta em UTC e pode cair no dia anterior.)
const toLocalDate = (value: string | null | undefined): Date | null => {
  const s = (value ?? '').substring(0, 10);
  if (!s) return null;
  const d = parseISO(s);
  return isNaN(d.getTime()) ? null : d;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/95 backdrop-blur border border-border/50 shadow-xl rounded-xl px-4 py-3 text-sm">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span>{p.name}: <span className="font-medium text-foreground">{p.value}</span></span>
        </div>
      ))}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const now = new Date();

  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [loading, setLoading] = useState(true);
  const [consultas, setConsultas] = useState<ConsultaMTRow[]>([]);

  const SELECT_FIELDS = 'id, data, hora, status, funcionarios_mt(nome, numero_funcionario)';

  useEffect(() => {
    let cancelled = false;
    const fetchConsultas = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('consultas_mt' as any)
        .select(SELECT_FIELDS)
        .order('hora', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('Erro ao carregar consultas_mt:', error);
        setConsultas([]);
      } else {
        setConsultas((data ?? []) as unknown as ConsultaMTRow[]);
      }
      setLoading(false);
    };
    fetchConsultas();
    return () => { cancelled = true; };
  }, []);

  // Agenda de hoje: estritamente consultas MT cuja data corresponde a hoje (date-fns isToday)
  const agendaHoje = useMemo(
    () =>
      consultas.filter((c) => {
        const d = toLocalDate(c.data);
        return !!d && isToday(d);
      }),
    [consultas]
  );

  // ─── Métricas derivadas (date-fns isSameMonth / isSameYear / isAfter) ──────
  const { realizadosAno, concluidosMes, faltasMes, proximosAgendamentos } = useMemo(() => {
    const refMes = new Date(selectedYear, selectedMonth, 1);
    const hoje = startOfToday();
    let realizadosAno = 0, concluidosMes = 0, faltasMes = 0, proximosAgendamentos = 0;
    for (const c of consultas) {
      const d = toLocalDate(c.data);
      if (!d) continue;

      if (c.status === 'agendada' && (isToday(d) || isAfter(d, hoje))) {
        proximosAgendamentos++;
      }

      if (!isSameYear(d, refMes)) continue;
      const noMes = isSameMonth(d, refMes);
      if (c.status === 'concluida') {
        realizadosAno++;
        if (noMes) concluidosMes++;
      } else if (noMes && c.status === 'falta') {
        faltasMes++;
      }
    }
    return { realizadosAno, concluidosMes, faltasMes, proximosAgendamentos };
  }, [consultas, selectedMonth, selectedYear]);

  const kpis = { realizadosAno, concluidosMes, faltasMes, proximosAgendamentos };

  // ─── Gráfico: volume semanal (4 semanas) de consultas MT no mês selecionado ─
  const chartData: ChartPoint[] = useMemo(() => {
    const pontos: ChartPoint[] = Array.from({ length: 4 }, (_, i) => ({
      semana: `Semana ${i + 1}`,
      concluidas: 0,
      faltas: 0,
    }));
    const refMes = new Date(selectedYear, selectedMonth, 1);

    const consultasDoMes = consultas.filter((c) => {
      const d = toLocalDate(c.data);
      return !!d && isSameMonth(d, refMes) && isSameYear(d, refMes);
    });

    for (const c of consultasDoMes) {
      const d = toLocalDate(c.data)!;
      const dia = d.getDate();
      const weekIdx = dia <= 7 ? 0 : dia <= 14 ? 1 : dia <= 21 ? 2 : 3;
      if (c.status === 'concluida') {
        pontos[weekIdx].concluidas++;
      } else if (c.status === 'falta') {
        pontos[weekIdx].faltas++;
      }
    }
    return pontos;
  }, [consultas, selectedMonth, selectedYear]);

  const anos = useMemo(() => {
    const atual = new Date().getFullYear();
    const lista = Array.from({ length: 5 }, (_, i) => atual - 3 + i);
    return lista.includes(selectedYear) ? lista : [...lista, selectedYear].sort((a, b) => a - b);
  }, [selectedYear]);

  const firstName = profile?.nome?.split(' ')[0] || 'Utilizador';

  return (
    <div className="flex flex-col gap-4 w-full h-[calc(100vh-6rem)] flex-1 min-h-0 overflow-hidden">
      {/* ── Greeting header + filtros ───────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4 pt-1 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {getGreeting()}, {firstName}!
          </h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">
            Medicina do Trabalho &nbsp;·&nbsp; {formatDate()}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-40 h-10 shadow-sm">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((nome, i) => (
                <SelectItem key={nome} value={String(i)}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-28 h-10 shadow-sm">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anos.map((ano) => (
                <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPI Grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full shrink-0">
        {KPI_CONFIG.map((cfg) => (
          <div key={cfg.key} className="bg-card p-5 rounded-2xl border shadow-sm">
            <div className="flex justify-between mb-4">
              <p className="text-xs font-medium text-muted-foreground">{cfg.label}</p>
              <cfg.icon className={`w-5 h-5 ${cfg.iconColor}`} />
            </div>
            {loading ? <Skeleton className="h-8 w-12" /> : <p className="text-3xl font-bold">{kpis[cfg.key]}</p>}
          </div>
        ))}
      </div>

      {/* ── Main split: Agenda + Chart ──────────────────── */}
      <div className="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agenda */}
        <div className="bg-card rounded-2xl border p-5 h-full min-h-0 flex flex-col">
          <h2 className="text-sm font-semibold mb-4 shrink-0">Agenda de Hoje</h2>
          {loading ? <Skeleton className="h-40 w-full" /> : agendaHoje.length === 0 ? <p className="text-xs text-muted-foreground">Sem marcações.</p> : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {agendaHoje.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-xl cursor-pointer"
                  onClick={() => navigate('/medicina-trabalho?tab=consultas')}
                >
                  <div className="w-1 h-8 rounded-full bg-primary/60" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.funcionarios_mt?.nome || 'Funcionário não identificado'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(item.hora ?? '').substring(0, 5) || '-'}
                      {item.funcionarios_mt?.numero_funcionario ? ` · Nº ${item.funcionarios_mt.numero_funcionario}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="bg-card rounded-2xl border p-5 h-full min-h-0 flex flex-col">
          <h2 className="text-sm font-semibold mb-4 shrink-0">Consultas MT · {MESES[selectedMonth]} {selectedYear}</h2>
          <div className="flex-1 min-h-0 w-full">
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" strokeOpacity={0.5} />
                  <XAxis dataKey="semana" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="concluidas" name="Concluídas" fill="#4CAF50" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="faltas" name="Faltas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
