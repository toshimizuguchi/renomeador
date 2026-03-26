import React, { useMemo, useState, useCallback } from 'react';
import { Upload, FileText, Wand2, Copy, Download, Trash2, Loader2, CheckCircle2, FileUp, Sparkles, Files } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { extractPDFText, parseNFData } from '@/lib/pdf-parser';

const sanitize = (value) => {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const moneyBRL = (value) => {
  if (!value) return '';
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return value;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
};

const formatDateBR = (value) => {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}-${m}-${y}`;
};

const buildFileName = ({ empresa, tipoItem, dataEmissao, numeroNF, fornecedor, valor, extensao = 'pdf' }) => {
  const partes = [
    sanitize(empresa),
    sanitize(tipoItem),
    sanitize(formatDateBR(dataEmissao)),
    sanitize(numeroNF),
    sanitize(fornecedor),
    sanitize(moneyBRL(valor)),
  ].filter(Boolean);

  if (!partes.length) return `ARQUIVO.${extensao.toUpperCase()}`;
  return `${partes.join(' - ').toUpperCase()}.${extensao.toLowerCase()}`;
};

const emptyRow = (id, arquivoOriginal = '') => ({
  id,
  arquivoOriginal,
  fileObject: null, // Store the raw file for downloading later
  empresa: 'QE',
  tipoItem: '',
  dataEmissao: '',
  numeroNF: '',
  fornecedor: '',
  valor: '',
  status: 'idle', // idle, loading, success, error
  error: '',
  ocrStatus: '', // Para mostrar progresso do OCR
  extractedText: '', // Para debug (opcional exibir)
  extensao: 'pdf',
});

export default function RenomeadorNFWeb() {
  const [rows, setRows] = useState([emptyRow(Date.now())]);
  const [copied, setCopied] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const processFile = async (id, file) => {
    updateRow(id, 'status', 'loading');
    updateRow(id, 'ocrStatus', 'Lendo PDF...');
    updateRow(id, 'arquivoOriginal', file.name);
    updateRow(id, 'fileObject', file);
    
    try {
      console.log(`Iniciando leitura do arquivo: ${file.name}`);
      const text = await extractPDFText(file);
      updateRow(id, 'extractedText', text); // Salva para debug
      const data = parseNFData(text);
      
      console.log('Dados extraídos:', data);
      
      Object.entries(data).forEach(([k, v]) => {
        if (v) updateRow(id, k, v);
      });
      updateRow(id, 'status', 'success');
      updateRow(id, 'ocrStatus', 'Concluído');
    } catch (e) {
      console.error('Erro ao ler PDF:', e);
      updateRow(id, 'status', 'error');
      updateRow(id, 'error', 'Não foi possível ler os dados automáticos deste PDF (tente preencher manualmente).');
    }
  };

  const updateRow = (id, field, value) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const addRow = (arquivoOriginal = '') => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setRows((current) => [...current, emptyRow(id, arquivoOriginal)]);
    return id;
  };

  const removeRow = (id) => {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== id)));
  };

  const downloadFile = (row) => {
    if (!row.fileObject) return;
    const url = URL.createObjectURL(row.fileObject);
    const link = document.createElement('a');
    link.href = url;
    link.download = row.nomeFinal;
    link.click();
    URL.revokeObjectURL(url);
  };

  const results = useMemo(() => {
    return rows.map((row) => ({
      ...row,
      nomeFinal: buildFileName(row),
    }));
  }, [rows]);

  const copyName = async (name) => {
    await navigator.clipboard.writeText(name);
    setCopied(name);
    setTimeout(() => setCopied(''), 1500);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length > 0) {
      files.forEach(file => {
        const id = addRow(file.name);
        processFile(id, file);
      });
    }
  }, [rows]);

  const onFileInput = (e) => {
    const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
    if (files.length > 0) {
      files.forEach(file => {
        const id = addRow(file.name);
        processFile(id, file);
      });
    }
  };

  const exportCSV = () => {
    const headers = ['arquivo_original','empresa','servico_ou_produto','data_emissao','numero_nf','fornecedor','valor','nome_final'];
    const lines = results.map((row) => [row.arquivoOriginal, row.empresa, row.tipoItem, row.dataEmissao, row.numeroNF, row.fornecedor, row.valor, row.nomeFinal]);
    const csv = [headers, ...lines].map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'renomeador_notas.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 selection:bg-purple-500/30 font-sans selection:text-white pb-20 overflow-x-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse delay-700" />
        <div className="absolute top-[30%] right-[10%] w-[20%] h-[20%] bg-indigo-600/5 blur-[80px] rounded-full" />
      </div>

      <div className="mx-auto max-w-7xl px-6 pt-12">
        <header className="mb-12 relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-tr from-purple-600 to-blue-600 rounded-2xl shadow-xl shadow-purple-500/20">
                <Files className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
                Auto Renomeador NF
              </h1>
            </div>
            <p className="max-w-xl text-slate-400 text-lg leading-relaxed mt-2">
              Envie seus PDFs e deixe nossa inteligência extrair os dados e renomear seguindo o padrão oficial QE/ME.
            </p>
          </motion.div>
        </header>

        {/* Dropzone Area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            "relative group mb-12 p-10 border-2 border-dashed rounded-3xl transition-all duration-300 overflow-hidden",
            isDragging 
              ? "border-purple-500 bg-purple-500/10 scale-[1.01]" 
              : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
          )}
        >
          <input 
            type="file" 
            multiple 
            accept=".pdf" 
            onChange={onFileInput}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
          />
          <div className="flex flex-col items-center gap-4 text-center">
            <div className={cn(
              "p-6 rounded-full transition-transform duration-500",
              isDragging ? "bg-purple-600 scale-110" : "bg-slate-800 group-hover:bg-slate-700"
            )}>
              <FileUp className={cn("h-8 w-8", isDragging ? "text-white" : "text-slate-400")} />
            </div>
            <div>
              <p className="text-xl font-medium text-slate-200">Arraste seus comprovantes ou clique aqui</p>
              <p className="text-sm text-slate-500 mt-1">Formatos suportados: PDF (Leitura automática disponível)</p>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <section className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                Registros Atuais
              </h2>
              <div className="flex gap-2">
                 <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={exportCSV}>
                    <Download className="mr-2 h-4 w-4" /> Exportar CSV
                 </Button>
              </div>
            </div>

            <AnimatePresence mode="popLayout">
              {rows.map((row, index) => (
                <motion.div
                  key={row.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative"
                >
                  <Card className="overflow-hidden border-slate-800 bg-slate-900/50 backdrop-blur-md rounded-3xl transition-all hover:bg-slate-900/80 hover:border-slate-700">
                    {row.status === 'loading' && (
                      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[4px] z-20 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-10 w-10 text-purple-500 animate-spin" />
                          <span className="text-purple-300 font-medium animate-pulse">{row.ocrStatus || 'Lendo...'}</span>
                        </div>
                      </div>
                    )}
                    {row.status === 'error' && (
                       <div className="bg-red-500/10 border-b border-red-500/20 p-3 text-center text-xs text-red-400">
                         {row.error}
                       </div>
                    )}
                    <CardHeader className="pb-4 border-b border-slate-800/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center h-7 w-7 rounded-full bg-slate-800 text-xs font-bold text-slate-400">
                            {index + 1}
                          </span>
                          <CardTitle className="text-lg font-medium text-slate-200">
                            {row.arquivoOriginal || 'Novo Registro'}
                          </CardTitle>
                          {row.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        </div>
                        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-red-400 transition-colors" onClick={() => removeRow(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-slate-400">Tipo de Empresa</Label>
                          <Select value={row.empresa} onValueChange={(v) => updateRow(row.id, 'empresa', v)}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl focus:ring-purple-500/20 transition-all">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                              <SelectItem value="QE">QE (Quero Educação)</SelectItem>
                              <SelectItem value="ME">ME (Melhor Escola)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-slate-400">Serviço / Produto</Label>
                          <Select value={row.tipoItem} onValueChange={(v) => updateRow(row.id, 'tipoItem', v)}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl focus:ring-purple-500/20">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                              <SelectItem value="Serviço">SERVIÇO</SelectItem>
                              <SelectItem value="Produto">PRODUTO</SelectItem>
                              <SelectItem value="Fatura">FATURA</SelectItem>
                              <SelectItem value="Invoice">INVOICE</SelectItem>
                              <SelectItem value="Boleto">BOLETO</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-slate-400">Fornecedor</Label>
                          <Input
                            placeholder="Nome da empresa"
                            value={row.fornecedor}
                            onChange={(e) => updateRow(row.id, 'fornecedor', e.target.value)}
                            className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl focus:ring-purple-500/20"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-slate-400">Data Emissão</Label>
                            <Input
                              type="date"
                              value={row.dataEmissao}
                              onChange={(e) => updateRow(row.id, 'dataEmissao', e.target.value)}
                              className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl focus:ring-purple-500/20"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-slate-400">Valor (R$)</Label>
                            <Input
                              placeholder="0,00"
                              value={row.valor}
                              onChange={(e) => updateRow(row.id, 'valor', e.target.value)}
                              className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl focus:ring-purple-500/20"
                            />
                          </div>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                           <Label className="text-slate-400">Número da NF</Label>
                           <Input
                              placeholder="000.000.000"
                              value={row.numeroNF}
                              onChange={(e) => updateRow(row.id, 'numeroNF', e.target.value)}
                              className="bg-slate-950 border-slate-800 text-slate-200 rounded-xl focus:ring-purple-500/20"
                            />
                        </div>
                        {row.extractedText && (
                          <div className="md:col-span-2">
                             <details className="text-xs text-slate-500 cursor-pointer">
                                <summary className="hover:text-slate-300">Ver texto extraído (Debug)</summary>
                                <pre className="mt-2 p-3 bg-slate-950 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-40">
                                  {row.extractedText}
                                </pre>
                             </details>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>

            <Button
              onClick={() => addRow()}
              className="w-full h-16 border-2 border-slate-800 border-dashed bg-transparent hover:bg-slate-900/50 text-slate-400 hover:text-white rounded-3xl transition-all"
            >
              <Wand2 className="mr-2 h-5 w-5" /> Adicionar registro manualmente
            </Button>
          </section>

          <aside className="space-y-6">
            <div className="sticky top-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-400" />
                  Preview Final
                </h2>
                {results.some(r => r.fileObject) && (
                  <Button 
                    size="sm"
                    variant="outline"
                    onClick={() => results.forEach(row => row.fileObject && downloadFile(row))}
                    className="rounded-xl border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                  >
                    Baixar Todos
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {results.map((row) => (
                  <motion.div
                    key={row.id}
                    layout
                    className="p-5 rounded-3xl border border-slate-800 bg-slate-900/30 backdrop-blur-sm group hover:border-purple-500/50 transition-colors"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          {row.arquivoOriginal || 'ARQUIVO MANUAL'}
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">
                          <div className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                          <span className="text-[9px] font-bold uppercase tracking-tight text-purple-400">Live Sync</span>
                        </div>
                      </div>
                      <div className="text-sm font-medium text-slate-200 break-all leading-relaxed font-mono">
                        {row.nomeFinal}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <Button 
                          onClick={() => copyName(row.nomeFinal)}
                          className={cn(
                            "rounded-xl px-4 py-2 transition-all duration-300",
                            copied === row.nomeFinal 
                              ? "bg-emerald-600 text-white" 
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          )}
                        >
                          {copied === row.nomeFinal ? (
                            <><CheckCircle2 className="mr-2 h-4 w-4" /> Copiado!</>
                          ) : (
                            <><Copy className="mr-2 h-4 w-4" /> Nome</>
                          )}
                        </Button>
                        {row.fileObject && (
                          <Button 
                            onClick={() => downloadFile(row)}
                            className="rounded-xl px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white transition-all duration-300 shadow-lg shadow-blue-500/20"
                          >
                            <Download className="mr-2 h-4 w-4" /> Baixar PDF
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {results.length > 0 && (
                <div className="mt-8 p-6 bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/10 rounded-3xl shadow-2xl">
                   <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Dica</h3>
                   <p className="text-slate-300 text-sm leading-relaxed">
                     Ao arrastar vários arquivos de uma vez, processamos cada um deles individualmente para poupar seu tempo.
                   </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
