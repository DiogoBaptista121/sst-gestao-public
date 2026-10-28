import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSuperAdmin } from '@/hooks/use-super-admin';
import { DataTable, Column } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Calendar as CalendarIcon,
  Plus,
  Search,
  FileDown,
  FileUp,
  Edit2,
  Loader2,
  Stethoscope,
  Check,
  ChevronsUpDown,
  Trash2,
  User,
  UserPen,
  X
} from 'lucide-react';
import { FuncionarioEditModal } from './FuncionarioEditModal';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ConsultaStatus } from '@/types/database';
import * as XLSX from 'xlsx';

interface FuncionarioBasico {
  id: string;
  nome: string;
  numero_funcionario: string;
}

interface ConsultaMTRow {
  id: string;
  funcionario_id: string;
  tipo_exame: string | null;
  data: string;
  hora: string;
  status: ConsultaStatus;
  resultado: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
  funcionarios_mt: {
    id: string;
    nome: string;
    numero_funcionario: string;
  } | null;
}

// Blocos de 20 minutos entre as 09:00 e as 17:00 (último início às 16:40)
const generateTimeSlots = (start = '09:00', end = '17:00', stepMinutes = 20): string[] => {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const slots: string[] = [];
  for (let m = toMinutes(start); m < toMinutes(end); m += stepMinutes) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return slots;
};

// Converte 'YYYY-MM-DD' (ou ISO com hora) para Date à meia-noite local, sem desvios de fuso
const parseDataLocal = (value: string): Date => parseISO(value.substring(0, 10));

const TIME_SLOTS = generateTimeSlots();

const TIPOS_EXAME = [
  { value: 'admissão', label: 'Admissão' },
  { value: 'periódico', label: 'Periódica' },
  { value: 'ocasional', label: 'Ocasional' },
];

export function ConsultasMTTab() {
  const { canEdit, role, user } = useAuth();

  // ✅ Roles atualizadas: só admin cria/edita/apaga; colaborador_mt altera apenas o status
  const isViewer = role === 'visualizador';
  const canManageBulk = role === 'admin';
  const canImportExport = role === 'admin';
  const hasEditAccess = role === 'admin';
  const canChangeStatus = role === 'admin' || role === 'colaborador_mt';

  const { isSuperAdmin } = useSuperAdmin();
  const [loading, setLoading] = useState(true);
  const [consultas, setConsultas] = useState<ConsultaMTRow[]>([]);
  const [funcionarios, setFuncionarios] = useState<FuncionarioBasico[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  // Por defeito mostra as consultas do dia atual (data local, formato YYYY-MM-DD)
  const [dataFilter, setDataFilter] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  const [modalOpen, setModalOpen] = useState(false);
  const [editingConsulta, setEditingConsulta] = useState<ConsultaMTRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingConsulta, setDeletingConsulta] = useState<ConsultaMTRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [funcionarioOpen, setFuncionarioOpen] = useState(false);
  const [fichaFuncionarioId, setFichaFuncionarioId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    funcionario_id: '',
    numero_funcionario: '',
    tipo_exame: 'periódico',
    data: '',
    hora: '',
    status: 'agendada' as ConsultaStatus,
    notas: '',
    resultado: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    const [consultasRes, funcionariosRes] = await Promise.all([
      supabase
        .from('consultas_mt' as any)
        .select('*, funcionarios_mt(id, nome, numero_funcionario)')
        .order('data', { ascending: false })
        .order('hora', { ascending: true }),

      supabase
        .from('funcionarios_mt' as any)
        .select('id, nome, numero_funcionario')
        .eq('estado', 'Ativo' as any)
        .order('nome'),
    ]);

    if (consultasRes.error) {
      console.error('Error fetching consultas_mt:', consultasRes.error);
      toast.error('Erro ao carregar consultas MT: ' + consultasRes.error.message);
    } else {
      setConsultas((consultasRes.data ?? []) as unknown as ConsultaMTRow[]);
    }

    if (funcionariosRes.error) {
      console.error('Error fetching funcionarios_mt:', funcionariosRes.error);
    } else {
      setFuncionarios((funcionariosRes.data ?? []) as unknown as FuncionarioBasico[]);
    }

    setLoading(false);
  };

  const filteredConsultas = consultas.filter((c) => {
    const func = c.funcionarios_mt;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const nome = (func?.nome || '').toString().toLowerCase();
      const numero = (func?.numero_funcionario ?? '').toString().toLowerCase();

      if (!nome.includes(term) && !numero.includes(term)) {
        return false;
      }
    }

    if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
    // Compara apenas dia/mês/ano, ignorando qualquer componente de hora
    if (dataFilter && (c.data ?? '').substring(0, 10) !== dataFilter) return false;

    return true;
  });

  const openCreateModal = () => {
    setEditingConsulta(null);
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      funcionario_id: '',
      numero_funcionario: '',
      tipo_exame: 'periódico',
      data: today,
      hora: '09:00',
      status: 'agendada',
      notas: '',
      resultado: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (consulta: ConsultaMTRow) => {
    setEditingConsulta(consulta);
    setFormData({
      funcionario_id: consulta.funcionario_id,
      numero_funcionario: consulta.funcionarios_mt?.numero_funcionario || '',
      tipo_exame: consulta.tipo_exame || 'periódico',
      data: consulta.data,
      hora: (consulta.hora ?? '').substring(0, 5),
      status: consulta.status,
      notas: consulta.notas || '',
      resultado: consulta.resultado || '',
    });
    setModalOpen(true);
  };

  // "Último Exame" = data da consulta mais recente com status 'concluida'.
  // Consultas agendadas, confirmadas, canceladas ou com falta são ignoradas;
  // se a mais recente não estiver concluída, usa-se a concluída anterior.
  // Se não existir nenhuma concluída, o valor atual (ex.: importado) é mantido.
  const recalcUltimoExame = async (funcionarioId: string | null | undefined) => {
    if (!funcionarioId) return;
    const { data, error } = await supabase
      .from('consultas_mt' as any)
      .select('data')
      .eq('funcionario_id', funcionarioId)
      .eq('status', 'concluida')
      .order('data', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('Erro ao calcular ultimo_exame:', error.message);
      return;
    }

    const ultima = (data as any[] | null)?.[0]?.data as string | undefined;
    if (!ultima) return;

    const { error: syncErr } = await supabase
      .from('funcionarios_mt')
      .update({ ultimo_exame: ultima.substring(0, 10) })
      .eq('id', funcionarioId);
    if (syncErr) {
      console.warn('Erro ao sincronizar ultimo_exame:', syncErr.message);
    }
  };

  const handleSave = async () => {
    if (!formData.funcionario_id) {
      toast.error('Selecione um funcionário');
      return;
    }
    if (!formData.data || !formData.hora) {
      toast.error('Preencha a data e hora');
      return;
    }

    setSaving(true);

    const horaFormatada = formData.hora.substring(0, 5);

    const payload: Record<string, unknown> = {
      funcionario_id: formData.funcionario_id,
      numero_funcionario: formData.numero_funcionario
        ? Number(formData.numero_funcionario) || null
        : null,
      tipo_exame: formData.tipo_exame,
      data: formData.data,
      hora: horaFormatada,
      status: formData.status,
      resultado: formData.resultado.trim() || null,
      notas: formData.notas.trim() || null,
    };

    const syncUltimoExame = async () => {
      await recalcUltimoExame(formData.funcionario_id);
      // Se a consulta mudou de funcionário, recalcula também o anterior
      if (editingConsulta && editingConsulta.funcionario_id !== formData.funcionario_id) {
        await recalcUltimoExame(editingConsulta.funcionario_id);
      }
    };

    if (editingConsulta) {
      const { error } = await supabase
        .from('consultas_mt' as any)
        .update(payload)
        .eq('id', editingConsulta.id);

      if (error) {
        toast.error('Erro ao atualizar consulta: ' + error.message);
      } else {
        await syncUltimoExame();
        toast.success('Consulta atualizada com sucesso');
        setModalOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('consultas_mt' as any)
        .insert([payload]);

      if (error) {
        toast.error('Erro ao criar consulta: ' + error.message);
      } else {
        await syncUltimoExame();
        toast.success('Consulta MT criada com sucesso');
        setModalOpen(false);
        fetchData();
      }
    }

    setSaving(false);
  };

  const openDeleteDialog = (consulta: ConsultaMTRow) => {
    setDeletingConsulta(consulta);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingConsulta) return;

    setDeleting(true);
    const { error } = await supabase
      .from('consultas_mt' as any)
      .delete()
      .eq('id', deletingConsulta.id);

    if (error) {
      toast.error('Erro ao eliminar consulta MT');
    } else {
      toast.success('Consulta MT eliminada com sucesso');
      await recalcUltimoExame(deletingConsulta.funcionario_id);
      setDeleteDialogOpen(false);
      setDeletingConsulta(null);
      fetchData();
    }
    setDeleting(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    const { error } = await supabase
      .from('consultas_mt' as any)
      .delete()
      .in('id', selectedIds as any);

    if (error) {
      toast.error('Erro ao eliminar consultas: ' + error.message);
    } else {
      const afetados = [...new Set(
        consultas.filter((c) => selectedIds.includes(c.id)).map((c) => c.funcionario_id)
      )];
      await Promise.all(afetados.map((fid) => recalcUltimoExame(fid)));
      toast.success(`${selectedIds.length} consulta(s) eliminada(s) com sucesso`);
      setSelectedIds([]);
      setBulkDeleteDialogOpen(false);
      fetchData();
    }
    setBulkDeleting(false);
  };

  const handleQuickStatusChange = async (consulta: ConsultaMTRow, newStatus: ConsultaStatus) => {
    const { error } = await supabase
      .from('consultas_mt' as any)
      .update({ status: newStatus })
      .eq('id', consulta.id);

    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success('Status atualizado');
      await recalcUltimoExame(consulta.funcionario_id);
      fetchData();
    }
  };

  const handleExport = () => {
    const exportData = filteredConsultas.map((c) => ({
      'Data': c.data,
      'Hora': (c.hora ?? '').substring(0, 5),
      'Funcionário': c.funcionarios_mt?.nome || '',
      'Nº Funcionário': c.funcionarios_mt?.numero_funcionario || '',
      'Tipo Exame': c.tipo_exame || '',
      'Status': c.status,
      'Resultado': c.resultado || '',
      'Notas': c.notas || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consultas MT');
    XLSX.writeFile(wb, `consultas_mt_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Ficheiro exportado com sucesso');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        let imported = 0;
        let errors = 0;

        for (const row of jsonData as any[]) {
          const numFuncionario = row['Nº Funcionário'] || row['numero_funcionario'];

          const { data: funcionarioData } = await supabase
            .from('funcionarios_mt' as any)
            .select('id')
            .eq('numero_funcionario', numFuncionario)
            .single();

          if (!funcionarioData) { errors++; continue; }

          const payload: Record<string, unknown> = {
            funcionario_id: (funcionarioData as any).id,
            tipo_exame: row['Tipo Exame'] || row['tipo_exame'] || 'periódico',
            data: row['Data'] || row['data'],
            hora: row['Hora'] || row['hora'],
            status: (row['Status'] || row['status'] || 'agendada') as ConsultaStatus,
            notas: row['Notas'] || row['notas'] || null,
            resultado: row['Resultado'] || row['resultado'] || null,
          };

          if (!payload.data || !payload.hora) { errors++; continue; }

          const { error } = await supabase.from('consultas_mt' as any).insert([payload]);
          if (!error) imported++;
          else errors++;
        }

        toast.success(`Importação concluída: ${imported} criados, ${errors} erros`);
        fetchData();
      } catch (err) {
        toast.error('Erro ao processar ficheiro');
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const formatData = (data: string) => {
    try {
      return format(new Date(data), "dd 'de' MMM, yyyy", { locale: pt });
    } catch {
      return data;
    }
  };

  const selectedFuncionario = funcionarios.find((f) => f.id === formData.funcionario_id);
  const allFilteredIds = filteredConsultas.map((c) => c.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...allFilteredIds])]);
    }
  };

  const baseColumns: Column<ConsultaMTRow>[] = [
    { key: 'numero_funcionario', header: 'Nº Funcionário', cell: (item) => item.funcionarios_mt?.numero_funcionario || '-' },
    {
      key: 'nome',
      header: 'Nome Completo',
      cell: (item) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm">{item.funcionarios_mt?.nome || '-'}</span>
          {item.funcionario_id && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Abrir ficha do funcionário"
              className="h-6 w-6 text-muted-foreground hover:text-primary shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setFichaFuncionarioId(item.funcionario_id);
              }}
            >
              <User className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
    },
    { key: 'data', header: 'Data', cell: (item) => formatData(item.data) },
    { key: 'hora', header: 'Hora', cell: (item) => (item.hora ?? '').substring(0, 5) || '-' },
    { key: 'tipo_exame', header: 'Tipo de Exame', cell: (item) => item.tipo_exame || 'Periódico' },
    {
      key: 'status',
      header: 'Status',
      cell: (item) => (
        <div className="flex items-center gap-2">
          {canChangeStatus ? (
            <Select value={item.status} onValueChange={(value) => handleQuickStatusChange(item, value as ConsultaStatus)}>
              <SelectTrigger className="w-32 h-8">
                <StatusBadge status={item.status as ConsultaStatus} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agendada">Agendada</SelectItem>
                <SelectItem value="confirmada">Confirmada</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
                <SelectItem value="falta">Falta</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <StatusBadge status={item.status as ConsultaStatus} />
          )}
        </div>
      ),
    },
    {
      key: 'resultado',
      header: 'Resultado',
      cell: (item) => {
        const labels: Record<string, string> = {
          'apto': 'Apto',
          'apto_com_recomendacoes': 'Apto c/ Recomendações',
          'inapto_temporario': 'Inapto Temporário',
          'inapto': 'Inapto',
          'apto_com_restricao': 'Apto c/ Restrição',
          'pendente': 'Pendente',
        };
        return item.resultado ? (labels[item.resultado] || item.resultado) : '-';
      },
    },
    ...(hasEditAccess
      ? [
          {
            key: 'actions',
            header: '',
            cell: (item: ConsultaMTRow) => (
              <div className="flex items-center gap-1 justify-end">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); openEditModal(item); }}>
                  <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
                {isSuperAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => { e.stopPropagation(); openDeleteDialog(item); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ),
            className: 'w-16',
          },
        ]
      : []),
  ];

  const checkboxColumn: Column<ConsultaMTRow> = {
    key: 'select' as any,
    header: (
      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
        className="h-4 w-4 rounded border-gray-300" aria-label="Selecionar todos" />
    ) as any,
    cell: (item) => (
      <input type="checkbox" checked={selectedIds.includes(item.id)}
        onChange={(e) => { e.stopPropagation(); setSelectedIds((prev) => e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)); }}
        onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-gray-300" />
    ),
    className: 'w-10',
  };

  const columns = !canManageBulk ? baseColumns : [checkboxColumn, ...baseColumns];

  const hasActiveFilters =
    searchTerm.trim() !== '' || statusFilter !== 'todos' || dataFilter !== '';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('todos');
    setDataFilter('');
  };

  return (
    <div className="flex flex-col h-full gap-5">
      {/* BLOCO 1: PageHeader */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Medicina do Trabalho</h1>
          <p className="text-sm text-muted-foreground">Gestão de consultas de medicina do trabalho</p>
        </div>
        {hasEditAccess && (
          <div className="flex items-center gap-3 shrink-0">
            {canImportExport && (
              <>
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
                  <Button variant="outline" className="gap-2 h-10 shadow-sm" asChild>
                    <span><FileUp className="w-4 h-4 text-muted-foreground" />Importar</span>
                  </Button>
                </label>
                <Button variant="outline" onClick={handleExport} className="gap-2 h-10 shadow-sm">
                  <FileDown className="w-4 h-4 text-muted-foreground" />Exportar
                </Button>
              </>
            )}
            <Button onClick={openCreateModal} className="gap-2 h-10 shadow-sm">
              <Plus className="w-4 h-4" />Nova Consulta MT
            </Button>
          </div>
        )}
      </div>

      {/* BLOCO 2: Barra de Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-center shrink-0 w-full">
        <div className="relative w-full sm:max-w-sm shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Pesquisar funcionário..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 h-10 shadow-sm" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full sm:w-auto sm:min-w-[11rem] justify-start text-left font-normal h-10 px-3 shadow-sm",
                !dataFilter && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dataFilter ? format(parseDataLocal(dataFilter), "PPP", { locale: pt }) : <span>Filtrar por data...</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={pt}
              selected={dataFilter ? parseDataLocal(dataFilter) : undefined}
              onSelect={(date) => setDataFilter(date ? format(date, "yyyy-MM-dd") : "")}
              initialFocus
            />
            {dataFilter && (
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setDataFilter("")}>
                  Limpar data
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 h-10 shadow-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="agendada">Agendada</SelectItem>
            <SelectItem value="confirmada">Confirmada</SelectItem>
            <SelectItem value="concluida">Concluída</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
            <SelectItem value="falta">Falta</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            onClick={clearFilters}
            className="h-10 px-2 lg:px-3 text-muted-foreground hover:text-foreground"
          >
            <X className="mr-2 h-4 w-4" />
            Limpar
          </Button>
        )}
        {isSuperAdmin && selectedIds.length > 0 && (
          <Button variant="destructive" className="gap-2 h-10 shadow-sm shrink-0 sm:ml-auto w-full sm:w-auto"
            onClick={() => setBulkDeleteDialogOpen(true)}>
            <Trash2 className="w-4 h-4" />Eliminar ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* BLOCO 3: Card da Tabela */}
      <div className="flex flex-col flex-1 bg-card rounded-lg border border-border/50 shadow-sm overflow-hidden">
        <div className="flex-1 overflow-auto">
          <DataTable columns={columns} data={filteredConsultas} loading={loading}
            emptyTitle="Sem consultas MT"
            emptyDescription="Ainda não existem consultas de medicina do trabalho."
            onRowClick={hasEditAccess ? openEditModal : undefined} />
        </div>

        {!loading && (
          <div className="shrink-0 flex items-center justify-between px-5 py-3 text-xs text-muted-foreground border-t border-border/50">
            <span>A mostrar <span className="font-semibold text-foreground mx-1">{filteredConsultas.length}</span> de{' '}
              <span className="font-semibold text-foreground mx-1">{consultas.length}</span> consultas MT</span>
            {selectedIds.length > 0 && (
              <span className="text-primary font-medium">{selectedIds.length} selecionada(s)</span>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && fichaFuncionarioId) return;
          setModalOpen(open);
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => {
            if (fichaFuncionarioId) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (fichaFuncionarioId) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (fichaFuncionarioId) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-primary" />
              {editingConsulta ? 'Editar Consulta MT' : 'Nova Consulta MT'}
            </DialogTitle>
             <DialogDescription>
              {editingConsulta ? 'Atualize os dados da consulta' : 'Agende uma nova consulta de medicina do trabalho'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label className="text-sm">Funcionário *</Label>
              <div className="flex items-center gap-2">
                <Popover open={funcionarioOpen} onOpenChange={setFuncionarioOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={funcionarioOpen} className="flex-1 justify-between font-normal h-10">
                      {selectedFuncionario ? `${selectedFuncionario.nome} (${selectedFuncionario.numero_funcionario})` : 'Selecione um funcionário...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[480px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Pesquisar funcionário..." className="h-10" />
                      <CommandList>
                        <CommandEmpty>Nenhum funcionário encontrado.</CommandEmpty>
                        <CommandGroup>
                          {funcionarios.map((func) => (
                            <CommandItem key={func.id} value={`${func.nome} ${func.numero_funcionario}`}
                              onSelect={() => { setFormData({ ...formData, funcionario_id: func.id, numero_funcionario: func.numero_funcionario }); setFuncionarioOpen(false); }}>
                              <Check className={cn('mr-2 h-4 w-4', formData.funcionario_id === func.id ? 'opacity-100' : 'opacity-0')} />
                              {func.nome} ({func.numero_funcionario})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {formData.funcionario_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Abrir ficha do funcionário"
                    className="h-10 w-10 shrink-0 text-muted-foreground hover:text-primary"
                    onClick={() => setFichaFuncionarioId(formData.funcionario_id)}
                  >
                    <UserPen className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="col-span-2 space-y-2">
              <Label className="text-sm">Tipo de Exame</Label>
              <div className="flex flex-wrap gap-2">
                {TIPOS_EXAME.map((tipo) => (
                  <Button
                    key={tipo.value}
                    type="button"
                    size="sm"
                    variant={formData.tipo_exame === tipo.value ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, tipo_exame: tipo.value })}
                    className="h-9"
                  >
                    {tipo.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Data *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-10 px-3",
                      !formData.data && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.data ? format(parseDataLocal(formData.data), "PPP", { locale: pt }) : <span>Selecione uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={pt}
                    selected={formData.data ? parseDataLocal(formData.data) : undefined}
                    onSelect={(date) =>
                      setFormData({ ...formData, data: date ? format(date, "yyyy-MM-dd") : "" })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Status</Label>
              <Select value={formData.status} onValueChange={(value: ConsultaStatus) => setFormData({ ...formData, status: value })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="confirmada">Confirmada</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                  <SelectItem value="falta">Falta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-2">
              <Label className="text-sm">Hora *</Label>
              <div className="grid grid-cols-6 gap-1.5">
                {TIME_SLOTS.map((slot) => (
                  <Button
                    key={slot}
                    type="button"
                    size="sm"
                    variant={formData.hora === slot ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, hora: slot })}
                    className="h-8 px-0 text-xs"
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Resultado</Label>
              <Select value={formData.resultado} onValueChange={(value) => setFormData({ ...formData, resultado: value })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione o resultado..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="apto">Apto</SelectItem>
                  <SelectItem value="apto_com_recomendacoes">Apto com Recomendações</SelectItem>
                  <SelectItem value="inapto_temporario">Inapto Temporário</SelectItem>
                  <SelectItem value="inapto">Inapto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Notas</Label>
              <Textarea value={formData.notas} onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                placeholder="Observações da consulta..." rows={1} className="resize-none min-h-10" />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="outline" className="h-10" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button className="h-10" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingConsulta ? 'Guardar Alterações' : 'Criar Consulta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar Consulta MT"
        description="Tem a certeza que deseja eliminar esta consulta de medicina do trabalho? Esta ação não pode ser desfeita."
      />

      <FuncionarioEditModal
        open={!!fichaFuncionarioId}
        onOpenChange={(open) => {
          if (!open) setFichaFuncionarioId(null);
        }}
        funcionarioId={fichaFuncionarioId}
        onSaved={fetchData}
        isSubModal={modalOpen}
        onBack={modalOpen ? () => setFichaFuncionarioId(null) : undefined}
      />
    </div>
  );
}