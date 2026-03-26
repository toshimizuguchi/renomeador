import * as pdfjs from 'pdfjs-dist';
// Use the worker from the package directly in Vite
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import Tesseract from 'tesseract.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export const extractPDFText = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    fullText += strings.join(' ') + '\n';
  }

  // Fallback to OCR if text is short
  if (fullText.trim().length < 50) {
    fullText = await runOCR(pdf);
  }

  return fullText;
};

const runOCR = async (pdf) => {
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport: viewport }).promise;
  const imageData = canvas.toDataURL('image/png');

  const { data: { text } } = await Tesseract.recognize(imageData, 'por');
  return text;
};

export const parseNFData = (text) => {
  const data = {
    tipoItem: '',
    dataEmissao: '',
    numeroNF: '',
    fornecedor: '',
    valor: '',
    empresa: 'QE',
  };

  const cleanText = text.replace(/\s+/g, ' ');
  const upperText = cleanText.toUpperCase();

  // 1. Identificação da Empresa Destinatária (QE ou ME)
  if (upperText.includes('MELHOR ESCOLA') || upperText.includes('MELHORESCOLA')) {
    data.empresa = 'ME';
  } else if (upperText.includes('QUERO EDUCACAO') || upperText.includes('QUERO EDUCAÇÃO') || upperText.includes('APRIMORAR EDUCACIONAL')) {
    data.empresa = 'QE';
  }

  // 2. Identificação de SERVICO ou PRODUTO
  const isProduct = (upperText.includes('DANFE') || upperText.includes('NF-E') ||
    upperText.includes('NOTA FISCAL ELETRONICA') ||
    upperText.includes('NOTA FISCAL ELETRÔNICA')) &&
    !upperText.includes('NFS-E') && !upperText.includes('DANFSE');

  const isService = !isProduct && (upperText.includes('NFS-E') ||
    upperText.includes('DANFSE') ||
    upperText.includes('DOCUMENTO AUXILIAR DA NFS-E') ||
    upperText.includes('SERVICO') ||
    upperText.includes('ISSQN'));

  if (isProduct) {
    data.tipoItem = 'Produto';
  } else if (isService) {
    data.tipoItem = 'Serviço';
  }

  // 3. Fornecedor (Emitente / Prestador)
  const supplierKeywords = [
    'Nome\\s*\\/\\s*Nome\\s+Empresarial',
    'Nome\\s*\\/\\s*Razão\\s+Social',
    'Razão\\s+Social',
    'Prestador\\s+de\\s+Serviços',
    'Emitente',
    'Nome\\s*\\/\\s*Nome'
  ].join('|');

  const cleanName = (raw) => {
    if (!raw) return '';
    let name = raw.trim();
    name = name.replace(/\d{2,3}(?:\.\d{3}){2}\/\d{4}-\d{2}/g, '');
    name = name.replace(/\d{3}(?:\.\d{3}){2}-\d{2}/g, '');
    name = name.replace(/\d{11,}/g, '');
    name = name.replace(/(?:Nome\/Razão Social|CPF\/CNPJ|Inscrição Municipal|Endereço|Município|UF|CEP|CPF|Nome\/Nome)/gi, '');
    name = name.replace(/\s+/g, ' ').trim();
    if (/^[0-9\s\/.-]+$/.test(name)) return '';
    return name;
  };

  // Específico para DANFE: Nome após "RECEBEMOS DE"
  const recebemosMatch = cleanText.match(/RECEBEMOS\s+DE\s+([A-Z0-9\s,&./-]{4,60}?(?=\s*(?:OS\s+PRODUTOS|PRODUTOS|CONTANTES|$)))/i);
  if (recebemosMatch) data.fornecedor = cleanName(recebemosMatch[1]);

  if (!data.fornecedor) {
    const nameRegexF = new RegExp(`(?:${supplierKeywords})[:.\\s]*([A-Z0-9\\s,&./-]{4,80}?(?=\\s*(?:E-mail|E-MAIL|Endereço|CNPJ|Telefone|CPF|UF|CEP|$)))`, 'i');
    const nameRegexB = new RegExp(`([A-Z0-9\\s,&./-]{4,80}?)\\s*(?:${supplierKeywords}|CPF\\/CNPJ)`, 'i');
    const matchF = cleanText.match(nameRegexF);
    const matchB = cleanText.match(nameRegexB);
    if (matchF) data.fornecedor = cleanName(matchF[1]);
    if (!data.fornecedor && matchB) data.fornecedor = cleanName(matchB[1]);
  }

  // Fallback Fornecedor
  if (!data.fornecedor || data.fornecedor.length < 3) {
    if (upperText.includes('ALLEVO')) {
      data.fornecedor = 'ALLEVO';
    } else {
      const fullMatches = cleanText.match(/[A-Z\s]{4,60}?\s(?:LTDA|S\.A|ME|EPP|S\/A|SERVICOS|TECNOLOGIA|EDUCACAO|INFORMATICA|PRODUTOS)/gi);
      if (fullMatches) {
        for (const m of fullMatches) {
          const cleaned = m.trim();
          if (!cleaned.toUpperCase().includes('QUERO EDUCACAO') && !cleaned.toUpperCase().includes('MELHOR ESCOLA')) {
            data.fornecedor = cleaned;
            break;
          }
        }
      }
    }
  }

  // Se ainda estiver vazio e for Produto, tenta pegar o nome logo no início (DANFE costuma ter o nome em destaque)
  if (!data.fornecedor && isProduct) {
    const danfeUpperMatch = cleanText.match(/([A-Z0-9\s,&./-]{4,60}?)\s+DANFE/i);
    if (danfeUpperMatch) data.fornecedor = cleanName(danfeUpperMatch[1]);
  }

  // 4. Número da NF (melhorado)
  const nfPatterns = [
    /(?:Número\s+da\s+NFS-e|Número\s+da\s+NF-e|Número\s+da\s+NFE|Número\s+da\s+NF|Número|Nº|No|N\.º|N\.|N|N0|NUMERO)[:\s]*(\d+(?:[\s.-]*\d+)*)/i,
    /(\d{3})\s*[.-]\s*(\d{3})\s*[.-]\s*(\d{3})/,
    /N[ºo\.]?\s*(\d{1,9})/i,
    /(\d+)\s*[\/\-]\s*[A-Z]{1,3}/i // Formato prefeitura (SJC, etc)
  ];

  for (const pattern of nfPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const numPart = (match[1] || match[0]).replace(/\D/g, '');
      if (numPart.length >= 1) {
        data.numeroNF = numPart.padStart(9, '0').substring(0, 9);
        break;
      }
    }
  }

  // 5. Data de Emissão (mais flexível)
  const emissaoDateMatchF = cleanText.match(/(?:Data\s+e\s+Hora\s+da\s+emissão|DATA\s+DE\s+EMISSÃO|EMISSÃO|EMISS[\s\d:]*AO)[:\s]*(\d{2})\s*[\/.-]\s*(\d{2})\s*[\/.-]\s*(\d{4})/i);
  const emissaoDateMatchB = cleanText.match(/(\d{2})\s*[\/.-]\s*(\d{2})\s*[\/.-]\s*(\d{4})[\s0-9:]*(?:Data\s+e\s+Hora\s+da\s+emissão|DATA\s+DE\s+EMISSÃO|EMISSÃO)/i);

  if (emissaoDateMatchF) {
    data.dataEmissao = `${emissaoDateMatchF[3]}-${emissaoDateMatchF[2]}-${emissaoDateMatchF[1]}`;
  } else if (emissaoDateMatchB) {
    data.dataEmissao = `${emissaoDateMatchB[3]}-${emissaoDateMatchB[2]}-${emissaoDateMatchB[1]}`;
  } else {
    // Busca qualquer data no formato DD/MM/YYYY ou DD.MM.YYYY ou DD-MM-YYYY
    const dateMatch = cleanText.match(/(\d{2})\s*[\/.-]\s*(\d{2})\s*[\/.-]\s*(\d{4})/);
    if (dateMatch) data.dataEmissao = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  }

  // Função auxiliar para criar regex que suporta espaços opcionais entre letras (comum em extrações de PDF problemáticas)
  const flexibleRegex = (str) => {
    return str.split('').map(char => {
      if (char === ' ') return '\\s+';
      // Escapar caracteres especiais de regex
      if (['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '[', ']', '|', '\\'].includes(char)) {
        return '\\' + char + '\\s*';
      }
      return char + '\\s*';
    }).join('');
  };

  // 6. Valor Total
  const rawKeywords = [
    'Valor Total da Nota',
    'Valor Total dos Produtos',
    'Valor Total do Produto',
    'Valor Total da NF',
    'VALOR TOTAL DOS PRODUTOS',
    'Valor Líquido da NFS-e',
    'Valor dos serviços',
    'Valor do Serviço',
    'Valor Serviço',
    'Total a pagar',
    'Valor da Nota',
    'Valor Líquido',
    'Total Bruto',
    'Total Bruto da Nota'
  ];

  for (const kw of rawKeywords) {
    const kwRegex = new RegExp(flexibleRegex(kw), 'i');
    const kwMatch = cleanText.match(kwRegex);
    if (kwMatch) {
      // Pega uma janela maior após o match para garantir que encontre o valor
      const textAfter = cleanText.substring(kwMatch.index + kwMatch[0].length, kwMatch.index + kwMatch[0].length + 200);
      
      // Regex melhorada para valor monetário BR (ex: 1.234,56 ou 1234,56 ou R$ 100,00)
      const moneyMatch = textAfter.match(/(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (moneyMatch) {
        data.valor = moneyMatch[1];
        break;
      }
    }
  }

  // Fallback Valor: se não achou por palavra-chave, tenta pegar o maior valor monetário do fim da nota
  if (!data.valor) {
    const prices = cleanText.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
    if (prices && prices.length > 0) {
      // Frequentemente o maior valor ou o último é o total
      data.valor = prices[prices.length - 1]; 
    }
  }

  return data;
};
