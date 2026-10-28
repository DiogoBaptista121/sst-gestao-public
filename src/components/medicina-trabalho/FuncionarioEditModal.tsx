import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ArrowLeft, Calendar as CalendarIcon, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { FuncionarioMT } from '@/types/database';

interface FuncionarioEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioId: string | null;
  onSaved?: () => void;
  onBack?: () => void;
  isSubModal?: boolean;
}

export function FuncionarioEditModal({
  open,
  onOpenChange,
  funcionarioId,
  onSaved,
  onBack,
  isSubModal,
}: FuncionarioEditModalProps) {
  const { role } = useAuth();
  const isColaboradorMT = role === 'colaborador_mt';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    numero_funcionario: '',
    nome: '',
    telefone: '',
    data_nascimento: '',
    categoria: '',
    servico: '',
    data_admissao: '',
    ultimo_exame: '',
    estado: 'Ativo',
  });

  useEffect(() => {
    if (!open || !funcionarioId) return;
    let cancelled = false;

    const loadFuncionario = async () => {
      setLoading(true);
      setFormErrors({});
      const { data, error } = await supabase
        .from('funcionarios_mt')
        .select('*')
        .eq('id', funcionarioId)
        .single();

      if (cancelled) return;
      if (error || !data) {
        toast.error('Erro ao carregar ficha do funcionário');
        onOpenChange(false);
      } else {
        const f = data as unknown as FuncionarioMT;
        setFormData({
          numero_funcionario: String(f.numero_funcionario ?? ''),
          nome: f.nome || '',
          telefone: f.telefone ? String(f.telefone) : '',
          data_nascimento: f.data_nascimento || '',
          categoria: f.categoria || '',
          servico: f.servico || '',
          data_admissao: f.data_admissao || '',
          ultimo_exame: f.ultimo_exame || '',
          estado: f.estado || 'Ativo',
        });
      }
      setLoading(false);
    };

    loadFuncionario();
    return () => {
      cancelled = true;
    };
  }, [open, funcionarioId]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!isColaboradorMT) {
      if (!String(formData.numero_funcionario).trim()) {
        errors.numero_funcionario = 'Nº de Funcionário é obrigatório';
      } else if (!/^\d+$/.test(String(formData.numero_funcionario).trim())) {
        errors.numero_funcionario = 'Nº de Funcionário deve conter apenas números';
      }

      if (!formData.nome.trim()) {
        errors.nome = 'Nome Completo é obrigatório';
      }
    }

    if (formData.telefone && !/^\d{1,9}$/.test(String(formData.telefone).trim())) {
      errors.telefone = 'O telefone deve conter apenas números (máx 9)';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!funcionarioId || !validateForm()) return;

    setSaving(true);
    const telefoneVal = formData.telefone
      ? Number(String(formData.telefone).replace(/\D/g, '')) || null
      : null;

    const payload = isColaboradorMT
      ? { telefone: telefoneVal }
      : {
          numero_funcionario: String(formData.numero_funcionario).trim(),
          nome: formData.nome.trim(),
          telefone: telefoneVal,
          data_nascimento: formData.data_nascimento || null,
          categoria: formData.categoria.trim() || null,
          servico: formData.servico.trim() || null,
          data_admissao: formData.data_admissao || null,
          ultimo_exame: formData.ultimo_exame || null,
          estado: formData.estado || 'Ativo',
        };

    const { error } = await supabase
      .from('funcionarios_mt')
      .update(payload as any)
      .eq('id', funcionarioId);

    if (error) {
      toast.error('Erro ao guardar funcionário: ' + error.message);
    } else {
      toast.success('Funcionário atualizado com sucesso');
      if (onBack) {
        onBack();
      } else {
        onOpenChange(false);
      }
      onSaved?.();
    }

    setSaving(false);
  };

  const handleClose = () => {
    if (onBack) {
      onBack();
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent
        className={cn(
          'max-w-2xl max-h-[90vh] overflow-y-auto z-[60]',
          (onBack || isSubModal) && 'shadow-2xl ring-1 ring-border'
        )}
        onPointerDownOutside={(e) => {
          e.stopPropagation();
        }}
        onInteractOutside={(e) => {
          e.stopPropagation();
        }}
        onEscapeKeyDown={(e) => {
          e.stopPropagation();
        }}
      >
        <DialogHeader>
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="-ml-2 mb-1 w-fit h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar à Consulta
            </Button>
          )}
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Ficha do Funcionário
          </DialogTitle>
          <DialogDescription>
            {isColaboradorMT
              ? 'Pode consultar os dados do funcionário e atualizar o número de telefone.'
              : 'Atualize os dados do funcionário'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-6 py-6">
            {/* Row 1: Número + Estado */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-sm">Número do Funcionário *</Label>
                <Input
                  value={formData.numero_funcionario}
                  onChange={(e) =>
                    setFormData({ ...formData, numero_funcionario: e.target.value })
                  }
                  placeholder="Ex: 12345"
                  disabled={isColaboradorMT}
                  className={`h-10 ${formErrors.numero_funcionario ? 'border-destructive' : ''}`}
                />
                {formErrors.numero_funcionario && (
                  <p className="text-sm text-destructive">{formErrors.numero_funcionario}</p>
                )}
              </div>
              <div className="space-y-3">
                <Label className="text-sm">Estado</Label>
                <Select
                  value={formData.estado}
                  onValueChange={(value) =>
                    setFormData({ ...formData, estado: value })
                  }
                  disabled={isColaboradorMT}
                >
                  <SelectTrigger className="h-10" disabled={isColaboradorMT}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Nome Completo */}
            <div className="space-y-3">
              <Label className="text-sm">Nome Completo *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Nome do funcionário"
                disabled={isColaboradorMT}
                className={`h-10 ${formErrors.nome ? 'border-destructive' : ''}`}
              />
              {formErrors.nome && (
                <p className="text-sm text-destructive">{formErrors.nome}</p>
              )}
            </div>

            {/* Row 3: Telefone + Data Nascimento */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-sm">Telefone</Label>
                <Input
                  value={formData.telefone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                    setFormData({ ...formData, telefone: digits });
                  }}
                  placeholder="912345678"
                  inputMode="numeric"
                  maxLength={9}
                  className={`h-10 ${formErrors.telefone ? 'border-destructive' : ''}`}
                />
                {formErrors.telefone && (
                  <p className="text-sm text-destructive">{formErrors.telefone}</p>
                )}
              </div>
              <div className="space-y-3">
                <Label className="text-sm flex items-center gap-2">
                  Data de Nascimento
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={isColaboradorMT}
                      className={cn(
                        'w-full justify-start text-left font-normal h-10 px-3',
                        !formData.data_nascimento && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.data_nascimento ? (
                        format(new Date(formData.data_nascimento), 'PPP', { locale: pt })
                      ) : (
                        <span>Selecione uma data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={pt}
                      selected={formData.data_nascimento ? new Date(formData.data_nascimento) : undefined}
                      onSelect={(date) =>
                        setFormData({ ...formData, data_nascimento: date ? date.toISOString() : '' })
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Row 4: Categoria + Serviço */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-sm">Categoria</Label>
                <Input
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                  placeholder="Ex: Técnico Superior"
                  disabled={isColaboradorMT}
                  className="h-10"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-sm">Serviço</Label>
                <Input
                  value={formData.servico}
                  onChange={(e) => setFormData({ ...formData, servico: e.target.value })}
                  placeholder="Ex: Serviços Médicos"
                  disabled={isColaboradorMT}
                  className="h-10"
                />
              </div>
            </div>

            {/* Row 5: Admissão + Último Exame */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-sm">Data de Admissão</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={isColaboradorMT}
                      className={cn(
                        'w-full justify-start text-left font-normal h-10 px-3',
                        !formData.data_admissao && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.data_admissao ? (
                        format(new Date(formData.data_admissao), 'PPP', { locale: pt })
                      ) : (
                        <span>Selecione uma data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={pt}
                      selected={formData.data_admissao ? new Date(formData.data_admissao) : undefined}
                      onSelect={(date) =>
                        setFormData({ ...formData, data_admissao: date ? date.toISOString() : '' })
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-3">
                <Label className="text-sm">Último Exame</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={isColaboradorMT}
                      className={cn(
                        'w-full justify-start text-left font-normal h-10 px-3',
                        !formData.ultimo_exame && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.ultimo_exame ? (
                        format(new Date(formData.ultimo_exame), 'PPP', { locale: pt })
                      ) : (
                        <span>Selecione uma data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={pt}
                      selected={formData.ultimo_exame ? new Date(formData.ultimo_exame) : undefined}
                      onSelect={(date) =>
                        setFormData({ ...formData, ultimo_exame: date ? date.toISOString() : '' })
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button type="button" variant="outline" className="h-10" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="button" className="h-10" onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

