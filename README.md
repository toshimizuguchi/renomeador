# Auto Renomeador de NF (Vite + React)

Ferramenta inteligente para extração de dados de Notas Fiscais (NFS-e e DANFE) e renomeação automática de arquivos seguindo padrões corporativos.

## 🚀 Funcionalidades

- **Extração Automática**: Usa PDF.js e OCR (Tesseract.js) para extrair:
  - Nome do Fornecedor / Emitente
  - Número da Nota Fiscal (formatado com 9 dígitos)
  - Data de Emissão
  - Valor Total da Nota / Produtos
- **Suporte Amplo**: Compatível com NFS-e (incluindo layouts complexos como SJC) e DANFE (Produto).
- **Renomeação em Tempo Real**: Visualize a mudança do nome do arquivo instantaneamente ao ajustar os campos.
- **Exportação CSV**: Gere relatórios rápidos de todos os arquivos processados.
- **Modo Dark Premium**: Interface moderna com animações e alta responsividade.

## 🛠️ Tecnologias

- **React 19** + **Vite**
- **Tailwind CSS 4**
- **Lucide React** (Ícones)
- **Framer Motion** (Animações)
- **PDF.js** (Parsing de PDF)
- **Tesseract.js** (OCR para arquivos sem texto selecionável)

## 📦 Como usar

1.  **Arraste** um ou mais arquivos PDF para a área de upload.
2.  **Confira** os dados extraídos automaticamente.
3.  **Ajuste** se necessário (os campos são editáveis).
4.  **Copie** o novo nome do arquivo ou **baixe** o arquivo já renomeado diretamente pelo navegador.

## 🚢 Deploy no Vercel

O projeto está pronto para ser hospedado no Vercel. Use o comando:

```bash
npx vercel
```
