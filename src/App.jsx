import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import { 
  Camera, 
  FileText, 
  CheckCircle2, 
  Plus, 
  Minus,
  Search, 
  Sparkles, 
  Trash2, 
  X, 
  Building2, 
  Warehouse,
  RefreshCw,
  Lock,
  Users,
  Brain,
  LogOut,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Edit3,
  AlertTriangle,
  History,
  Copy,
  Key,
  Package,
  Filter,
  FileSpreadsheet,
  Printer,
  Layers
} from 'lucide-react';

// ============================================================================
// 1. CONFIGURAÇÃO DO SEU FIREBASE (PROJETO: controle-nf-fazenda)
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAh06a2MfQIfzTRrLBfqgDz3xpwENBofnI",
  authDomain: "controle-nf-fazenda.firebaseapp.com",
  projectId: "controle-nf-fazenda",
  storageBucket: "controle-nf-fazenda.firebasestorage.app",
  messagingSenderId: "741939918041",
  appId: "1:741939918041:web:ac156055f62da1495bfac8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "controle-nf-fazenda-prod";

// ============================================================================
// 2. PERFIS E SENHAS PADRÃO
// ============================================================================
const ROLES_CONFIG = {
  compras: { 
    label: 'Compras', 
    defaultPin: '1236', 
    canDispatch: true, 
    canConfirmAlmox: false, 
    canConfirmOffice: true, 
    canApproveDivergence: true,
    isAdmin: false 
  },
  auxiliar: { 
    label: 'Auxiliar de Escritório', 
    defaultPin: '4321', 
    canDispatch: true, 
    canConfirmAlmox: false, 
    canConfirmOffice: true, 
    canApproveDivergence: false,
    isAdmin: false 
  },
  almoxarife: { 
    label: 'Almoxarife', 
    defaultPin: '5678', 
    canDispatch: true, 
    canConfirmAlmox: true, 
    canConfirmOffice: false, 
    canApproveDivergence: false,
    isAdmin: false 
  },
  admin: { 
    label: 'Administrador', 
    defaultPin: '1234', 
    canDispatch: true, 
    canConfirmAlmox: true, 
    canConfirmOffice: true, 
    canApproveDivergence: true,
    isAdmin: true 
  }
};

const DEFAULT_USERS = [
  { id: 'u_compras', name: 'Compras', role: 'compras', pin: '1236', active: true },
  { id: 'u_auxiliar', name: 'Auxiliar de Escritório', role: 'auxiliar', pin: '4321', active: true },
  { id: 'u_almoxarife', name: 'Almoxarife', role: 'almoxarife', pin: '5678', active: true },
  { id: 'u_admin', name: 'Administrador', role: 'admin', pin: '1234', active: true }
];

const SETORES_FAZENDA = [
  'Almoxarifado Central',
  'Oficina Mecânica / Maquinário',
  'Lavoura (Soja / Milho)',
  'Cafeicultura (Robusta)',
  'Confinamento / Pecuária',
  'Secador / Silos',
  'Irrigação',
  'Administrativo / Sede'
];

// Comprime a imagem antes de enviar à IA para leitura rápida e leve
const compressImageDataUrl = (dataUrl, maxWidth = 1350) => {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.80));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

const readFileAsDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

const sleepMs = (ms) => new Promise(res => setTimeout(res, ms));

const formatDateTimeBR = (isoOrTs) => {
  if (!isoOrTs) return '-';
  const d = new Date(isoOrTs);
  if (isNaN(d.getTime())) return String(isoOrTs);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateBR = (d) => {
  if (!d) return '-';
  const parts = String(d).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
};

export default function App() {
  const [fbUser, setFbUser] = useState(null);
  const [remessas, setRemessas] = useState([]);
  const [appUsers, setAppUsers] = useState(DEFAULT_USERS);
  const [neuralMemory, setNeuralMemory] = useState({
    customRules: 'Identificar peças agrícolas, defensivos, sementes, insumos de pecuária e materiais de irrigação.',
    supplierLearnings: {},
    customGeminiKey: ''
  });
  const [loading, setLoading] = useState(true);

  const [loggedUser, setLoggedUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nf_logged_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [selectedLoginUserId, setSelectedLoginUserId] = useState('u_compras');
  const [loginPinInput, setLoginPinInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [almoxModalItem, setAlmoxModalItem] = useState(null);
  const [officeModalItem, setOfficeModalItem] = useState(null);
  const [comprasModalItem, setComprasModalItem] = useState(null);
  const [historyModalItem, setHistoryModalItem] = useState(null);
  const [clearDbModalOpen, setClearDbModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [neuralModalOpen, setNeuralModalOpen] = useState(false);

  // Referências para Câmera Nativa e Galeria (Até 20 arquivos)
  const galleryInputRef = useRef(null);
  const nativeCameraInputRef = useRef(null);

  // Estados de leitura IA individual e em Lote (até 20 notas)
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [lastAiError, setLastAiError] = useState('');
  const [neuralSuggestionBanner, setNeuralSuggestionBanner] = useState('');
  const [toast, setToast] = useState(null);

  const [batchQueueModalOpen, setBatchQueueModalOpen] = useState(false);
  const [batchItems, setBatchItems] = useState([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, active: false });
  const [batchGlobalConfig, setBatchGlobalConfig] = useState({
    setorDestino: 'Almoxarifado Central',
    portadorMotorista: '',
    foiComNota: 'SIM'
  });

  // Estados de Busca Rápida e Aba de Pesquisa Avançada
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advFilters, setAdvFilters] = useState({
    tipoData: 'EMISSAO', // EMISSAO | ENVIO | ALMOX
    dataInicio: '',
    dataFim: '',
    numeroNF: '',
    fornecedor: '',
    itemPeca: '',
    setor: 'TODOS'
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    numeroNF: '',
    serieNF: '',
    fornecedor: '',
    cnpjFornecedor: '',
    dataEmissaoNF: todayStr,
    valorTotal: '',
    resumoMercadoria: '',
    itens: [],
    chaveAcesso: '',
    dataEnvioFazenda: todayStr,
    portadorMotorista: '',
    setorDestino: 'Almoxarifado Central',
    foiComNota: 'SIM',
    statusAlmoxarifado: 'PENDENTE',
    dataRecebimentoAlmox: '',
    recebidoPorAlmox: '',
    statusRetornoEscritorio: 'PENDENTE',
    dataRetornoEscritorio: '',
    recebidoPorEscritorio: '',
    statusDivergenciaCompras: 'NENHUMA',
    historico: [],
    observacoes: '',
    anexoPreview: ''
  });

  const [almoxConfirmData, setAlmoxConfirmData] = useState({
    dataRecebimentoAlmox: todayStr,
    recebidoPorAlmox: '',
    observacoesAlmox: '',
    itensConferencia: []
  });

  const [officeConfirmData, setOfficeConfirmData] = useState({
    dataRetornoEscritorio: todayStr,
    recebidoPorEscritorio: '',
    observacoes: ''
  });

  const [comprasConfirmData, setComprasConfirmData] = useState({
    parecerCompras: '',
    itensRevisados: []
  });

  const [newUserForm, setNewUserForm] = useState({
    name: '',
    role: 'compras',
    pin: '1236'
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const currentPermissions = useMemo(() => {
    if (!loggedUser) return ROLES_CONFIG.compras;
    return ROLES_CONFIG[loggedUser.role] || ROLES_CONFIG.compras;
  }, [loggedUser]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error('Erro Auth Firebase:', err);
        setLoading(false);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      if (!u) setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!fbUser) return;

    const remessasRef = collection(db, 'artifacts', appId, 'public', 'data', 'remessas_nf');
    const unsubRemessas = onSnapshot(remessasRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRemessas(list);
      setLoading(false);
    }, (err) => {
      console.error('Erro Firestore:', err);
      setLoading(false);
    });

    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema');
    const unsubUsers = onSnapshot(usersRef, async (snap) => {
      if (snap.empty) {
        for (const u of DEFAULT_USERS) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema', u.id), u);
        }
      } else {
        const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAppUsers(loaded);
      }
    });

    const neuralDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'sistema_neural', 'config_principal');
    const unsubNeural = onSnapshot(neuralDocRef, (snap) => {
      if (snap.exists()) {
        setNeuralMemory(prev => ({ ...prev, ...snap.data() }));
      }
    });

    return () => {
      unsubRemessas();
      unsubUsers();
      unsubNeural();
    };
  }, [fbUser]);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleProfileLogin = (e) => {
    e.preventDefault();
    const targetUser = appUsers.find(u => u.id === selectedLoginUserId);
    if (!targetUser) return;
    const expectedPin = targetUser.pin || ROLES_CONFIG[targetUser.role]?.defaultPin || '1234';

    if (loginPinInput.trim() === expectedPin) {
      setLoggedUser(targetUser);
      localStorage.setItem('nf_logged_user', JSON.stringify(targetUser));
      setLoginPinInput('');
      setLoginError('');
      showToast(`Bem-vindo, ${targetUser.name}!`);
    } else {
      setLoginError('Senha incorreta para este perfil.');
    }
  };

  const handleLogout = () => {
    setLoggedUser(null);
    localStorage.removeItem('nf_logged_user');
  };

  const applyNeuralMemoryToSupplier = (fornecedorNome, cnpj) => {
    const key = (cnpj || fornecedorNome || '').replace(/\D/g, '') || (fornecedorNome || '').toUpperCase().trim();
    if (!key) return {};
    const learned = neuralMemory.supplierLearnings?.[key];
    if (learned) {
      return {
        recognized: true,
        setorDestino: learned.setorDestino || 'Almoxarifado Central',
        portadorMotorista: learned.portadorMotorista || ''
      };
    }
    return {};
  };

  const learnFromSavedDispatch = async (data) => {
    if (!fbUser || !data.fornecedor) return;
    const key = (data.cnpjFornecedor || '').replace(/\D/g, '') || data.fornecedor.toUpperCase().trim();
    if (!key) return;

    const updatedLearnings = {
      ...(neuralMemory.supplierLearnings || {}),
      [key]: {
        fornecedor: data.fornecedor,
        setorDestino: data.setorDestino,
        portadorMotorista: data.portadorMotorista,
        updatedAt: new Date().toISOString()
      }
    };

    try {
      const neuralDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'sistema_neural', 'config_principal');
      await setDoc(neuralDocRef, {
        ...neuralMemory,
        supplierLearnings: updatedLearnings
      }, { merge: true });
    } catch (e) {
      console.error('Erro ao salvar aprendizado:', e);
    }
  };

  // ==========================================================================
  // MOTOR DE EXTRAÇÃO GEMINI IA (USADO TANTO PARA 1 FOTO QUANTO PARA LOTE DE 20)
  // ==========================================================================
  const extractInvoiceFromDataUrl = async (rawDataUrl, mimeType, onStatusUpdate) => {
    const optimizedUrl = await compressImageDataUrl(rawDataUrl);
    const base64Data = optimizedUrl.split(',')[1];
    const finalMime = optimizedUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : mimeType;

    const savedKey = (neuralMemory.customGeminiKey || '').trim();
    const candidateKeys = [];
    if (savedKey) candidateKeys.push(savedKey);
    if (!candidateKeys.includes(firebaseConfig.apiKey)) candidateKeys.push(firebaseConfig.apiKey);

    const prompt = `Você é um especialista em leitura de Notas Fiscais brasileiras (DANFE / NF-e).
Extraia todos os dados da Nota Fiscal na imagem/PDF, incluindo a CHAVE DE ACESSO de 44 dígitos (remova espaços ou pontos da chave) e a LISTA INDIVIDUAL DE PRODUTOS/ITENS da nota.
Retorne APENAS um objeto JSON válido (sem blocos markdown) seguindo exatamente esta estrutura:
{
  "numeroNF": "string",
  "serieNF": "string",
  "fornecedor": "string",
  "cnpjFornecedor": "string",
  "dataEmissaoNF": "YYYY-MM-DD",
  "valorTotal": "numero com ponto ex 1450.50",
  "chaveAcesso": "44 digitos numericos da chave da NF",
  "resumoMercadoria": "resumo curto geral",
  "itens": [
    {
      "codigo": "codigo se houver",
      "descricao": "nome/descricao do produto",
      "quantidadeNF": 1,
      "unidade": "UN, KG, LT, SC, PC, etc",
      "valorUnitario": 0
    }
  ]
}`;

    let parsedData = null;
    const errorsLog = [];

    outerLoop:
    for (const keyToUse of candidateKeys) {
      let modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest'];
      try {
        const listRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keyToUse)}`,
          { headers: { 'x-goog-api-key': keyToUse } }
        );
        if (listRes.ok) {
          const listJson = await listRes.json();
          const available = (listJson.models || [])
            .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map(m => m.name.replace('models/', ''))
            .filter(name => 
              name.includes('gemini') && 
              !name.includes('embedding') && 
              !name.includes('aqa') && 
              !name.includes('tts') &&
              !name.includes('2.5') &&
              !name.includes('2.0') &&
              !name.includes('1.5')
            );

          available.sort((a, b) => {
            const score = (n) => (
              n === 'gemini-3.8-flash' ? 10 :
              n.includes('3.8-flash') ? 9 :
              n.includes('3.8') ? 8 :
              n.includes('3.') ? 7 :
              n === 'gemini-flash-latest' ? 6 :
              n.includes('flash') ? 5 : 1
            );
            return score(b) - score(a);
          });

          if (available.length > 0) {
            modelsToTry = available.slice(0, 4);
          }
        }
      } catch (e) {
        console.warn('ListModels ignorado:', e);
      }

      for (const modelName of modelsToTry) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            if (attempt > 1) {
              onStatusUpdate?.(`Servidor em pico, nova tentativa (${attempt}/3)...`);
              await sleepMs(1800 * (attempt - 1));
            }

            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(keyToUse)}`,
              {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'x-goog-api-key': keyToUse
                },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: prompt },
                      { inlineData: { mimeType: finalMime, data: base64Data } }
                    ]
                  }]
                })
              }
            );

            const resJson = await response.json();

            if (!response.ok) {
              const msg = resJson?.error?.message || `HTTP ${response.status}`;
              const isHighDemand = 
                response.status === 503 || 
                response.status === 429 || 
                msg.toLowerCase().includes('high demand') || 
                msg.toLowerCase().includes('overloaded') ||
                msg.toLowerCase().includes('try again later');

              if (isHighDemand && attempt < 3) {
                continue;
              }

              errorsLog.push(`[${modelName}]: ${msg}`);
              break;
            }

            let rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!rawText) {
              errorsLog.push(`[${modelName}]: Resposta vazia`);
              break;
            }

            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : rawText;
            parsedData = JSON.parse(cleanJson);
            break outerLoop;
          } catch (innerErr) {
            if (attempt === 3) {
              errorsLog.push(`[${modelName}]: ${innerErr.message}`);
            }
          }
        }
      }
    }

    if (!parsedData) {
      throw new Error(errorsLog.slice(0, 2).join(' | ') || 'API Gemini não respondeu');
    }

    const extractedItens = Array.isArray(parsedData.itens) && parsedData.itens.length > 0
      ? parsedData.itens.map((it, idx) => {
          const qtd = parseFloat(String(it.quantidadeNF ?? it.quantidade ?? 1).replace(',', '.')) || 1;
          return {
            id: `item_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            codigo: it.codigo || '',
            descricao: it.descricao || `Item ${idx + 1}`,
            unidade: (it.unidade || 'UN').toUpperCase(),
            quantidadeNF: qtd,
            quantidadeRecebida: qtd,
            valorUnitario: parseFloat(String(it.valorUnitario || 0).replace(',', '.')) || 0,
            divergente: false
          };
        })
      : parsedData.resumoMercadoria
        ? [{
            id: `item_${Date.now()}_0`,
            codigo: '',
            descricao: parsedData.resumoMercadoria,
            unidade: 'UN',
            quantidadeNF: 1,
            quantidadeRecebida: 1,
            valorUnitario: parseFloat(String(parsedData.valorTotal || 0).replace(',', '.')) || 0,
            divergente: false
          }]
        : [];

    const cleanChave = String(parsedData.chaveAcesso || '').replace(/\D/g, '');
    const neuralFill = applyNeuralMemoryToSupplier(parsedData.fornecedor, parsedData.cnpjFornecedor);

    return {
      numeroNF: parsedData.numeroNF || '',
      serieNF: parsedData.serieNF || '',
      fornecedor: parsedData.fornecedor || '',
      cnpjFornecedor: parsedData.cnpjFornecedor || '',
      dataEmissaoNF: parsedData.dataEmissaoNF || todayStr,
      valorTotal: parsedData.valorTotal ? String(parsedData.valorTotal) : '',
      resumoMercadoria: parsedData.resumoMercadoria || extractedItens.map(i => `${i.quantidadeNF} ${i.unidade} ${i.descricao}`).join('; '),
      itens: extractedItens,
      chaveAcesso: cleanChave,
      neuralFill
    };
  };

  // Leitura de 1 única foto (Câmera Nativa ou 1 arquivo da Galeria)
  const processSingleFileWithGemini = async (file) => {
    setIsScanning(true);
    setLastAiError('');
    setScanMessage('Otimizando imagem e lendo Nota Fiscal...');

    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const result = await extractInvoiceFromDataUrl(rawDataUrl, file.type || 'image/jpeg', setScanMessage);

      if (result.neuralFill?.recognized) {
        setNeuralSuggestionBanner(`Memória Neural: Fornecedor reconhecido! Setor (${result.neuralFill.setorDestino}) preenchido.`);
      }

      setFormData(prev => ({
        ...prev,
        numeroNF: result.numeroNF || prev.numeroNF,
        serieNF: result.serieNF || prev.serieNF,
        fornecedor: result.fornecedor || prev.fornecedor,
        cnpjFornecedor: result.cnpjFornecedor || prev.cnpjFornecedor,
        dataEmissaoNF: result.dataEmissaoNF || prev.dataEmissaoNF,
        valorTotal: result.valorTotal || prev.valorTotal,
        resumoMercadoria: result.resumoMercadoria || prev.resumoMercadoria,
        itens: result.itens.length > 0 ? result.itens : prev.itens,
        chaveAcesso: result.chaveAcesso || prev.chaveAcesso,
        setorDestino: result.neuralFill?.setorDestino || prev.setorDestino,
        portadorMotorista: result.neuralFill?.portadorMotorista || prev.portadorMotorista,
        anexoPreview: 'ANEXADO'
      }));

      showToast(`NF ${result.numeroNF || ''} lida com sucesso! ${result.itens.length} item(ns).`);
    } catch (err) {
      console.error('Erro detalhado na leitura IA:', err);
      setLastAiError(err.message || 'Erro desconhecido');
      showToast('Falha na leitura automática. Veja o detalhe abaixo dos botões.', 'error');
    } finally {
      setIsScanning(false);
      setScanMessage('');
    }
  };

  // ==========================================================================
  // PROCESSAMENTO EM LOTE (DE 2 ATÉ 20 NOTAS FISCAIS DE UMA VEZ)
  // ==========================================================================
  const processMultipleFilesInBatch = async (filesArray) => {
    const limitedFiles = filesArray.slice(0, 20);
    if (filesArray.length > 20) {
      showToast('Limite máximo de 20 notas por vez! Processando as 20 primeiras.', 'error');
    }

    setIsFormOpen(false);
    setBatchQueueModalOpen(true);
    setBatchProgress({ current: 0, total: limitedFiles.length, active: true });

    const initialQueue = limitedFiles.map((f, idx) => ({
      tempId: `batch_${Date.now()}_${idx}`,
      fileName: f.name,
      status: 'AGUARDANDO', // AGUARDANDO | LENDO | PRONTO | ERRO
      errorMsg: '',
      selected: true,
      numeroNF: '',
      fornecedor: '',
      cnpjFornecedor: '',
      dataEmissaoNF: todayStr,
      valorTotal: '',
      chaveAcesso: '',
      itens: [],
      resumoMercadoria: '',
      setorDestino: batchGlobalConfig.setorDestino,
      portadorMotorista: batchGlobalConfig.portadorMotorista,
      foiComNota: batchGlobalConfig.foiComNota
    }));
    setBatchItems(initialQueue);

    for (let i = 0; i < limitedFiles.length; i++) {
      const file = limitedFiles[i];
      setBatchProgress({ current: i + 1, total: limitedFiles.length, active: true });

      setBatchItems(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'LENDO' } : item));

      try {
        const rawDataUrl = await readFileAsDataUrl(file);
        const extracted = await extractInvoiceFromDataUrl(rawDataUrl, file.type || 'image/jpeg');

        setBatchItems(prev => prev.map((item, idx) => idx === i ? {
          ...item,
          status: 'PRONTO',
          selected: true,
          numeroNF: extracted.numeroNF || '',
          fornecedor: extracted.fornecedor || '',
          cnpjFornecedor: extracted.cnpjFornecedor || '',
          dataEmissaoNF: extracted.dataEmissaoNF || todayStr,
          valorTotal: extracted.valorTotal || '0',
          chaveAcesso: extracted.chaveAcesso || '',
          itens: extracted.itens || [],
          resumoMercadoria: extracted.resumoMercadoria || '',
          setorDestino: extracted.neuralFill?.setorDestino || item.setorDestino,
          portadorMotorista: extracted.neuralFill?.portadorMotorista || item.portadorMotorista
        } : item));

        // Pequena pausa entre notas para evitar bloqueio de pico na API gratuita
        if (i < limitedFiles.length - 1) {
          await sleepMs(650);
        }
      } catch (err) {
        setBatchItems(prev => prev.map((item, idx) => idx === i ? {
          ...item,
          status: 'ERRO',
          errorMsg: err.message || 'Falha ao ler nota',
          selected: true // Permite preencher manualmente na própria fila
        } : item));
      }
    }

    setBatchProgress(prev => ({ ...prev, active: false }));
    showToast('Leitura do lote concluída! Revise os dados antes de confirmar.');
  };

  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    if (files.length === 1) {
      processSingleFileWithGemini(files[0]);
    } else {
      processMultipleFilesInBatch(files);
    }
  };

  const handleSaveBatchAll = async () => {
    if (!fbUser) return;
    const toSave = batchItems.filter(it => it.selected && it.numeroNF.trim() !== '' && it.fornecedor.trim() !== '');

    if (toSave.length === 0) {
      showToast('Preencha Nº da NF e Fornecedor nas notas selecionadas.', 'error');
      return;
    }

    try {
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'remessas_nf');
      const nowIso = new Date().toISOString();

      for (const item of toSave) {
        const cleanItens = (item.itens || []).filter(i => i.descricao && i.descricao.trim() !== '');
        const autoResumo = cleanItens.length > 0
          ? cleanItens.map(i => `${i.quantidadeNF} ${i.unidade || 'UN'} - ${i.descricao}`).join(' | ')
          : item.resumoMercadoria;

        const historyEntry = {
          id: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
          dataHora: nowIso,
          usuario: loggedUser?.name || 'Usuário',
          perfil: ROLES_CONFIG[loggedUser?.role]?.label || '',
          acao: 'Despacho em Lote (Múltiplas NFs)',
          detalhes: `NF ${item.numeroNF} (${item.fornecedor}) com ${cleanItens.length} item(ns). Chave: ${item.chaveAcesso || 'Não informada'}.`
        };

        await addDoc(colRef, {
          numeroNF: item.numeroNF.trim(),
          serieNF: '',
          fornecedor: item.fornecedor.trim(),
          cnpjFornecedor: item.cnpjFornecedor || '',
          dataEmissaoNF: item.dataEmissaoNF || todayStr,
          valorTotal: parseFloat(String(item.valorTotal || 0).replace(',', '.')) || 0,
          resumoMercadoria: autoResumo,
          itens: cleanItens,
          chaveAcesso: String(item.chaveAcesso || '').replace(/\D/g, ''),
          dataEnvioFazenda: todayStr,
          portadorMotorista: item.portadorMotorista || batchGlobalConfig.portadorMotorista || '',
          setorDestino: item.setorDestino || batchGlobalConfig.setorDestino || 'Almoxarifado Central',
          foiComNota: item.foiComNota || batchGlobalConfig.foiComNota || 'SIM',
          statusAlmoxarifado: 'PENDENTE',
          dataRecebimentoAlmox: '',
          recebidoPorAlmox: '',
          statusRetornoEscritorio: 'PENDENTE',
          dataRetornoEscritorio: '',
          recebidoPorEscritorio: '',
          statusDivergenciaCompras: 'NENHUMA',
          historico: [historyEntry],
          observacoes: '',
          anexoPreview: 'ANEXADO_LOTE',
          lancadoPor: loggedUser?.name || 'Usuário',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      setBatchQueueModalOpen(false);
      setBatchItems([]);
      showToast(`${toSave.length} Nota(s) Fiscal(is) salva(s) com sucesso!`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar lote de notas.', 'error');
    }
  };

  // Funções para manipular itens dentro do formulário individual
  const handleAddFormItem = () => {
    setFormData(prev => ({
      ...prev,
      itens: [
        ...(prev.itens || []),
        {
          id: `item_${Date.now()}_${(prev.itens || []).length}`,
          codigo: '',
          descricao: '',
          unidade: 'UN',
          quantidadeNF: 1,
          quantidadeRecebida: 1,
          valorUnitario: 0,
          divergente: false
        }
      ]
    }));
  };

  const handleUpdateFormItem = (index, field, value) => {
    setFormData(prev => {
      const updated = [...(prev.itens || [])];
      const item = { ...updated[index], [field]: value };
      if (field === 'quantidadeNF') {
        const num = parseFloat(String(value).replace(',', '.')) || 0;
        item.quantidadeNF = num;
        item.quantidadeRecebida = num;
      }
      updated[index] = item;
      return { ...prev, itens: updated };
    });
  };

  const handleRemoveFormItem = (index) => {
    setFormData(prev => ({
      ...prev,
      itens: (prev.itens || []).filter((_, i) => i !== index)
    }));
  };

  const handleSaveRemessa = async (e) => {
    e.preventDefault();
    if (!fbUser) return;
    if (!formData.numeroNF || !formData.fornecedor) {
      showToast('Informe o Nº da NF e o Fornecedor.', 'error');
      return;
    }

    try {
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'remessas_nf');
      const cleanItens = (formData.itens || []).filter(i => i.descricao && i.descricao.trim() !== '');
      const autoResumo = cleanItens.length > 0
        ? cleanItens.map(i => `${i.quantidadeNF} ${i.unidade || 'UN'} - ${i.descricao}`).join(' | ')
        : formData.resumoMercadoria;

      const nowIso = new Date().toISOString();
      const historyEntry = {
        id: 'h_' + Date.now(),
        dataHora: nowIso,
        usuario: loggedUser?.name || 'Usuário',
        perfil: ROLES_CONFIG[loggedUser?.role]?.label || '',
        acao: editingId ? 'Edição do Registro da NF' : 'Despacho / Cadastro Inicial da NF',
        detalhes: `NF ${formData.numeroNF} (${formData.fornecedor}) com ${cleanItens.length} item(ns). Chave: ${formData.chaveAcesso || 'Não informada'}.`
      };

      const payload = {
        ...formData,
        chaveAcesso: String(formData.chaveAcesso || '').replace(/\D/g, ''),
        itens: cleanItens,
        resumoMercadoria: autoResumo,
        valorTotal: parseFloat(String(formData.valorTotal).replace(',', '.')) || 0,
        lancadoPor: loggedUser?.name || 'Usuário',
        historico: [...(formData.historico || []), historyEntry],
        updatedAt: Date.now()
      };

      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', editingId), payload);
        showToast('Registro atualizado!');
      } else {
        await addDoc(colRef, { ...payload, createdAt: Date.now() });
        showToast('Despacho registrado com sucesso!');
      }

      await learnFromSavedDispatch(formData);
      resetForm();
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar no banco.', 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      numeroNF: '',
      serieNF: '',
      fornecedor: '',
      cnpjFornecedor: '',
      dataEmissaoNF: todayStr,
      valorTotal: '',
      resumoMercadoria: '',
      itens: [],
      chaveAcesso: '',
      dataEnvioFazenda: todayStr,
      portadorMotorista: '',
      setorDestino: 'Almoxarifado Central',
      foiComNota: 'SIM',
      statusAlmoxarifado: 'PENDENTE',
      dataRecebimentoAlmox: '',
      recebidoPorAlmox: '',
      statusRetornoEscritorio: 'PENDENTE',
      dataRetornoEscritorio: '',
      recebidoPorEscritorio: '',
      statusDivergenciaCompras: 'NENHUMA',
      historico: [],
      observacoes: '',
      anexoPreview: ''
    });
    setNeuralSuggestionBanner('');
    setLastAiError('');
    setEditingId(null);
    setIsFormOpen(false);
  };

  // Ajuste de quantidade (+ / -) no modal de recebimento do Almoxarifado
  const adjustAlmoxItemQty = (index, delta) => {
    setAlmoxConfirmData(prev => {
      const list = [...prev.itensConferencia];
      const current = parseFloat(list[index].quantidadeRecebida) || 0;
      const next = Math.max(0, Number((current + delta).toFixed(2)));
      list[index] = {
        ...list[index],
        quantidadeRecebida: next,
        divergente: next !== Number(list[index].quantidadeNF)
      };
      return { ...prev, itensConferencia: list };
    });
  };

  const setAlmoxItemQtyDirect = (index, val) => {
    setAlmoxConfirmData(prev => {
      const list = [...prev.itensConferencia];
      const parsed = val === '' ? '' : Math.max(0, parseFloat(String(val).replace(',', '.')) || 0);
      list[index] = {
        ...list[index],
        quantidadeRecebida: parsed,
        divergente: Number(parsed || 0) !== Number(list[index].quantidadeNF)
      };
      return { ...prev, itensConferencia: list };
    });
  };

  const handleConfirmAlmox = async (e) => {
    e.preventDefault();
    if (!almoxModalItem) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', almoxModalItem.id);
      const itensFinais = (almoxConfirmData.itensConferencia || []).map(it => {
        const qNF = Number(it.quantidadeNF) || 0;
        const qRec = Number(it.quantidadeRecebida ?? qNF);
        return {
          ...it,
          quantidadeNF: qNF,
          quantidadeRecebida: qRec,
          divergente: qRec !== qNF
        };
      });

      const alteracoes = itensFinais.filter(it => it.divergente);
      const temDivergencia = alteracoes.length > 0;

      const detalhesAlteracao = temDivergencia
        ? `DIVERGÊNCIA DE QUANTIDADE: ` + alteracoes.map(a => `${a.descricao} (NF: ${a.quantidadeNF} ${a.unidade || 'UN'} ➔ Recebido: ${a.quantidadeRecebida} ${a.unidade || 'UN'})`).join('; ')
        : `Todos os ${itensFinais.length} item(ns) conferidos sem divergência.`;

      const novoHistorico = [
        ...(almoxModalItem.historico || []),
        {
          id: 'h_' + Date.now(),
          dataHora: new Date().toISOString(),
          usuario: almoxConfirmData.recebidoPorAlmox || loggedUser?.name || 'Almoxarife',
          perfil: ROLES_CONFIG[loggedUser?.role]?.label || 'Almoxarifado',
          acao: temDivergencia ? 'Recebimento Almoxarifado COM ALTERAÇÃO DE QTD' : 'Recebimento no Almoxarifado OK',
          detalhes: `${detalhesAlteracao}${almoxConfirmData.observacoesAlmox ? ` | Obs: ${almoxConfirmData.observacoesAlmox}` : ''}`
        }
      ];

      await updateDoc(docRef, {
        statusAlmoxarifado: 'RECEBIDO',
        dataRecebimentoAlmox: almoxConfirmData.dataRecebimentoAlmox,
        recebidoPorAlmox: almoxConfirmData.recebidoPorAlmox || loggedUser?.name || 'Almoxarife',
        itens: itensFinais,
        statusDivergenciaCompras: temDivergencia ? 'PENDENTE_COMPRAS' : 'NENHUMA',
        observacoes: almoxConfirmData.observacoesAlmox || almoxModalItem.observacoes || '',
        historico: novoHistorico,
        updatedAt: Date.now()
      });

      setAlmoxModalItem(null);
      if (temDivergencia) {
        showToast('Recebido! Divergência enviada para confirmação do Compras.', 'error');
      } else {
        showToast('Recebimento no Almoxarifado confirmado!');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao confirmar Almoxarifado.', 'error');
    }
  };

  // Confirmação de Divergência pelo Setor de Compras
  const handleApproveDivergenceCompras = async (e) => {
    e.preventDefault();
    if (!comprasModalItem) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', comprasModalItem.id);
      const itensValidados = (comprasConfirmData.itensRevisados || []).map(it => ({
        ...it,
        quantidadeRecebida: Number(it.quantidadeRecebida),
        divergente: Number(it.quantidadeRecebida) !== Number(it.quantidadeNF),
        confirmadoCompras: true
      }));

      const resumoRevisao = itensValidados
        .filter(i => i.divergente)
        .map(i => `${i.descricao}: NF=${i.quantidadeNF} / Confirmado=${i.quantidadeRecebida} ${i.unidade || 'UN'}`)
        .join('; ');

      const novoHistorico = [
        ...(comprasModalItem.historico || []),
        {
          id: 'h_' + Date.now(),
          dataHora: new Date().toISOString(),
          usuario: loggedUser?.name || 'Compras',
          perfil: ROLES_CONFIG[loggedUser?.role]?.label || 'Compras',
          acao: 'Divergência de Quantidade Confirmada pelo Compras',
          detalhes: `${resumoRevisao || 'Quantidades validadas.'}${comprasConfirmData.parecerCompras ? ` | Parecer Compras: ${comprasConfirmData.parecerCompras}` : ''}`
        }
      ];

      await updateDoc(docRef, {
        itens: itensValidados,
        statusDivergenciaCompras: 'APROVADA_COMPRAS',
        parecerCompras: comprasConfirmData.parecerCompras || '',
        aprovadoComprasPor: loggedUser?.name || 'Compras',
        dataAprovacaoCompras: todayStr,
        historico: novoHistorico,
        updatedAt: Date.now()
      });

      setComprasModalItem(null);
      showToast('Alteração de quantidade confirmada pelo Compras!');
    } catch (err) {
      console.error(err);
      showToast('Erro ao confirmar divergência.', 'error');
    }
  };

  const handleConfirmOffice = async (e) => {
    e.preventDefault();
    if (!officeModalItem) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', officeModalItem.id);
      const novoHistorico = [
        ...(officeModalItem.historico || []),
        {
          id: 'h_' + Date.now(),
          dataHora: new Date().toISOString(),
          usuario: officeConfirmData.recebidoPorEscritorio || loggedUser?.name || 'Escritório',
          perfil: ROLES_CONFIG[loggedUser?.role]?.label || 'Escritório',
          acao: 'Retorno da NF Física ao Escritório',
          detalhes: `Conferido por ${officeConfirmData.recebidoPorEscritorio || loggedUser?.name} em ${formatDateBR(officeConfirmData.dataRetornoEscritorio)}.`
        }
      ];

      await updateDoc(docRef, {
        statusRetornoEscritorio: 'RECEBIDO',
        dataRetornoEscritorio: officeConfirmData.dataRetornoEscritorio,
        recebidoPorEscritorio: officeConfirmData.recebidoPorEscritorio || loggedUser?.name || 'Escritório',
        observacoes: officeConfirmData.observacoes || officeModalItem.observacoes || '',
        historico: novoHistorico,
        updatedAt: Date.now()
      });
      setOfficeModalItem(null);
      showToast('Retorno da NF ao Escritório confirmado!');
    } catch {
      showToast('Erro ao confirmar retorno.', 'error');
    }
  };

  const handleDeleteRemessa = async (id) => {
    if (!currentPermissions.isAdmin) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', id));
      showToast('Registro excluído.');
    } catch {
      showToast('Erro ao excluir.', 'error');
    }
  };

  const handleClearAllDatabase = async () => {
    if (!currentPermissions.isAdmin) return;
    try {
      for (const item of remessas) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', item.id));
      }
      setClearDbModalOpen(false);
      showToast('Base de dados zerada com sucesso!');
    } catch {
      showToast('Erro ao zerar base.', 'error');
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.name.trim()) return;
    const newId = 'u_' + Date.now();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema', newId), {
      id: newId,
      name: newUserForm.name.trim(),
      role: newUserForm.role,
      pin: newUserForm.pin || '1234',
      active: true
    });
    setNewUserForm({ name: '', role: 'compras', pin: '1236' });
    showToast('Usuário cadastrado!');
  };

  const handleDeleteUser = async (uId) => {
    if (uId === 'u_admin') {
      showToast('O Administrador principal não pode ser removido.', 'error');
      return;
    }
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema', uId));
    showToast('Usuário removido.');
  };

  const copyChaveToClipboard = (chave) => {
    if (!chave) return;
    navigator.clipboard?.writeText(chave);
    showToast('Chave de Acesso copiada!');
  };

  const stats = useMemo(() => {
    const total = remessas.length;
    const pendAlmox = remessas.filter(r => r.statusAlmoxarifado !== 'RECEBIDO').length;
    const pendCompras = remessas.filter(r => r.statusDivergenciaCompras === 'PENDENTE_COMPRAS').length;
    const pendOffice = remessas.filter(r => r.statusRetornoEscritorio !== 'RECEBIDO').length;
    const concluidos = remessas.filter(
      r => r.statusAlmoxarifado === 'RECEBIDO' && 
           r.statusRetornoEscritorio === 'RECEBIDO' && 
           r.statusDivergenciaCompras !== 'PENDENTE_COMPRAS'
    ).length;
    return { total, pendAlmox, pendCompras, pendOffice, concluidos };
  }, [remessas]);

  // ==========================================================================
  // FILTRAGEM COMBINADA (BUSCA RÁPIDA + ABA DE PESQUISA AVANÇADA)
  // ==========================================================================
  const filteredRemessas = useMemo(() => {
    return remessas.filter(r => {
      const itensStr = (r.itens || []).map(i => i.descricao).join(' ');

      // 1. Busca Rápida Geral
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchesQuick = 
          (r.numeroNF || '').toLowerCase().includes(term) ||
          (r.fornecedor || '').toLowerCase().includes(term) ||
          (r.chaveAcesso || '').toLowerCase().includes(term) ||
          (r.resumoMercadoria || '').toLowerCase().includes(term) ||
          itensStr.toLowerCase().includes(term) ||
          (r.portadorMotorista || '').toLowerCase().includes(term);
        if (!matchesQuick) return false;
      }

      // 2. Filtros da Aba de Pesquisa Avançada
      if (advFilters.numeroNF.trim() !== '') {
        if (!(r.numeroNF || '').toLowerCase().includes(advFilters.numeroNF.trim().toLowerCase())) return false;
      }
      if (advFilters.fornecedor.trim() !== '') {
        if (!(r.fornecedor || '').toLowerCase().includes(advFilters.fornecedor.trim().toLowerCase())) return false;
      }
      if (advFilters.itemPeca.trim() !== '') {
        const itemTerm = advFilters.itemPeca.trim().toLowerCase();
        const inItens = (r.itens || []).some(i => (i.descricao || '').toLowerCase().includes(itemTerm));
        const inResumo = (r.resumoMercadoria || '').toLowerCase().includes(itemTerm);
        if (!inItens && !inResumo) return false;
      }
      if (advFilters.setor !== 'TODOS') {
        if (r.setorDestino !== advFilters.setor) return false;
      }
      if (advFilters.dataInicio || advFilters.dataFim) {
        const targetDate = 
          advFilters.tipoData === 'ENVIO' ? r.dataEnvioFazenda :
          advFilters.tipoData === 'ALMOX' ? r.dataRecebimentoAlmox :
          r.dataEmissaoNF;

        if (!targetDate) return false;
        if (advFilters.dataInicio && targetDate < advFilters.dataInicio) return false;
        if (advFilters.dataFim && targetDate > advFilters.dataFim) return false;
      }

      // 3. Filtro de Status nas Abas
      if (statusFilter === 'PEND_ALMOX') return r.statusAlmoxarifado !== 'RECEBIDO';
      if (statusFilter === 'PEND_COMPRAS') return r.statusDivergenciaCompras === 'PENDENTE_COMPRAS';
      if (statusFilter === 'PEND_ESCRITORIO') return r.statusRetornoEscritorio !== 'RECEBIDO';
      if (statusFilter === 'CONCLUIDO') {
        return r.statusAlmoxarifado === 'RECEBIDO' && 
               r.statusRetornoEscritorio === 'RECEBIDO' && 
               r.statusDivergenciaCompras !== 'PENDENTE_COMPRAS';
      }
      return true;
    });
  }, [remessas, searchTerm, statusFilter, advFilters]);

  const hasActiveAdvFilters = useMemo(() => {
    return (
      advFilters.dataInicio !== '' ||
      advFilters.dataFim !== '' ||
      advFilters.numeroNF.trim() !== '' ||
      advFilters.fornecedor.trim() !== '' ||
      advFilters.itemPeca.trim() !== '' ||
      advFilters.setor !== 'TODOS'
    );
  }, [advFilters]);

  const clearAdvancedFilters = () => {
    setAdvFilters({
      tipoData: 'EMISSAO',
      dataInicio: '',
      dataFim: '',
      numeroNF: '',
      fornecedor: '',
      itemPeca: '',
      setor: 'TODOS'
    });
    setSearchTerm('');
  };

  // ==========================================================================
  // EXPORTAÇÃO PARA EXCEL (CSV PADRÃO BRASILEIRO) E RELATÓRIO PDF
  // ==========================================================================
  const handleExportExcelCSV = () => {
    if (filteredRemessas.length === 0) {
      showToast('Nenhum registro na lista atual para exportar.', 'error');
      return;
    }

    const headers = [
      'Numero NF',
      'Data Emissao',
      'Fornecedor',
      'Valor Total (R$)',
      'Chave de Acesso (44 digitos)',
      'Itens (Qtd NF vs Qtd Recebida)',
      'Setor Destino',
      'Data Envio Fazenda',
      'Motorista / Portador',
      'Foi com Nota',
      'Status Almoxarifado',
      'Data Receb. Almoxarifado',
      'Recebido Por Almox.',
      'Status Divergencia Compras',
      'Parecer Compras',
      'Status Retorno Escritorio',
      'Data Retorno Escritorio',
      'Conferido Escritorio Por'
    ];

    const escapeCsv = (val) => {
      const str = String(val ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
      return `"${str}"`;
    };

    const rows = filteredRemessas.map(r => {
      const valorBR = Number(r.valorTotal || 0).toFixed(2).replace('.', ',');
      const itensFormatados = Array.isArray(r.itens) && r.itens.length > 0
        ? r.itens.map(i => `${i.descricao} [NF: ${String(i.quantidadeNF).replace('.', ',')} ${i.unidade || 'UN'} | Rec: ${String(i.quantidadeRecebida ?? i.quantidadeNF).replace('.', ',')} ${i.unidade || 'UN'}]`).join(' / ')
        : (r.resumoMercadoria || '');

      return [
        escapeCsv(r.numeroNF),
        escapeCsv(formatDateBR(r.dataEmissaoNF)),
        escapeCsv(r.fornecedor),
        escapeCsv(valorBR),
        escapeCsv(`'${r.chaveAcesso || ''}`), // Apóstrofo evita que o Excel converta os 44 dígitos em notação científica
        escapeCsv(itensFormatados),
        escapeCsv(r.setorDestino),
        escapeCsv(formatDateBR(r.dataEnvioFazenda)),
        escapeCsv(r.portadorMotorista),
        escapeCsv(r.foiComNota),
        escapeCsv(r.statusAlmoxarifado),
        escapeCsv(formatDateBR(r.dataRecebimentoAlmox)),
        escapeCsv(r.recebidoPorAlmox),
        escapeCsv(r.statusDivergenciaCompras || 'NENHUMA'),
        escapeCsv(r.parecerCompras || ''),
        escapeCsv(r.statusRetornoEscritorio),
        escapeCsv(formatDateBR(r.dataRetornoEscritorio)),
        escapeCsv(r.recebidoPorEscritorio)
      ].join(';');
    });

    // BOM UTF-8 (\uFEFF) garante acentuação perfeita ao abrir direto no Microsoft Excel
    const csvContent = '\uFEFF' + headers.join(';') + '\r\n' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Relatorio_NFs_Fazenda_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Planilha Excel (${filteredRemessas.length} NFs) baixada com sucesso!`);
  };

  const handleExportPDF = () => {
    if (filteredRemessas.length === 0) {
      showToast('Nenhum registro na lista atual para gerar PDF.', 'error');
      return;
    }

    const totalValor = filteredRemessas.reduce((acc, r) => acc + (Number(r.valorTotal) || 0), 0);
    const win = window.open('', '_blank');
    if (!win) {
      showToast('Permita pop-ups no navegador para abrir o PDF.', 'error');
      return;
    }

    const rowsHtml = filteredRemessas.map(r => {
      const itensHtml = Array.isArray(r.itens) && r.itens.length > 0
        ? r.itens.map(i => {
            const diff = Number(i.quantidadeRecebida ?? i.quantidadeNF) !== Number(i.quantidadeNF);
            return `<div style="margin-bottom:2px;">• <strong>${i.descricao}</strong> — NF: ${i.quantidadeNF} ${i.unidade || 'UN'} | Rec: <span style="${diff ? 'color:#b91c1c;font-weight:bold;' : 'color:#047857;'}">${i.quantidadeRecebida ?? i.quantidadeNF} ${i.unidade || 'UN'}</span></div>`;
          }).join('')
        : (r.resumoMercadoria || '-');

      return `
        <tr>
          <td>
            <strong>NF ${r.numeroNF}</strong><br/>
            <span style="font-size:10px;color:#555;">Emissão: ${formatDateBR(r.dataEmissaoNF)}</span><br/>
            <strong style="color:#047857;">${Number(r.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
          </td>
          <td>
            <strong>${r.fornecedor}</strong>
            ${r.chaveAcesso ? `<div style="font-family:monospace;font-size:9px;color:#444;margin-top:2px;word-break:break-all;">Chave: ${r.chaveAcesso}</div>` : ''}
          </td>
          <td style="font-size:10px;">${itensHtml}</td>
          <td>
            <strong>${r.setorDestino}</strong><br/>
            Envio: ${formatDateBR(r.dataEnvioFazenda)}<br/>
            Portador: ${r.portadorMotorista || '-'}
          </td>
          <td>
            <strong>${r.statusAlmoxarifado}</strong><br/>
            ${r.statusAlmoxarifado === 'RECEBIDO' ? `${formatDateBR(r.dataRecebimentoAlmox)} (${r.recebidoPorAlmox})` : 'Pendente'}
            ${r.statusDivergenciaCompras === 'PENDENTE_COMPRAS' ? '<div style="color:#b91c1c;font-weight:bold;margin-top:2px;">⚠ Divergência Qtd</div>' : ''}
          </td>
          <td>
            <strong>${r.statusRetornoEscritorio}</strong><br/>
            ${r.statusRetornoEscritorio === 'RECEBIDO' ? `${formatDateBR(r.dataRetornoEscritorio)} (${r.recebidoPorEscritorio})` : 'Pendente'}
          </td>
        </tr>
      `;
    }).join('');

    win.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Relatório de Controle de NFs - Fazenda</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 20px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 14px; }
          .title { font-size: 16px; font-weight: bold; color: #065f46; }
          .summary { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; display: flex; gap: 24px; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #334155; }
          @media print {
            .no-print { display: none; }
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:12px;text-align:right;">
          <button onclick="window.print()" style="background:#059669;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;cursor:pointer;">
            🖨️ Imprimir / Salvar como PDF
          </button>
        </div>
        <div class="header">
          <div>
            <div class="title">Relatório de Controle de Notas Fiscais — Fazenda</div>
            <div style="font-size:11px;color:#64748b;">Gerado em ${formatDateTimeBR(new Date().toISOString())} por ${loggedUser?.name || 'Usuário'}</div>
          </div>
        </div>
        <div class="summary">
          <div><strong>Total de Notas no Relatório:</strong> ${filteredRemessas.length}</div>
          <div><strong>Valor Total Somado:</strong> ${totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
          <div><strong>Filtro Status:</strong> ${statusFilter}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:12%;">NF / Valor</th>
              <th style="width:20%;">Fornecedor / Chave</th>
              <th style="width:28%;">Itens Individuais (NF vs Recebido)</th>
              <th style="width:14%;">Setor / Envio</th>
              <th style="width:13%;">1. Almoxarifado</th>
              <th style="width:13%;">2. Escritório</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <script>
          setTimeout(() => { window.print(); }, 400);
        </script>
      </body>
      </html>
    `);
    win.document.close();
  };

  // Prepara a lista de itens ao abrir o modal do Almoxarifado
  const openAlmoxModalForItem = (item) => {
    const baseItens = Array.isArray(item.itens) && item.itens.length > 0
      ? item.itens.map(it => ({
          ...it,
          quantidadeNF: Number(it.quantidadeNF) || 1,
          quantidadeRecebida: Number(it.quantidadeRecebida ?? it.quantidadeNF) || 1
        }))
      : [{
          id: 'item_legado_0',
          descricao: item.resumoMercadoria || 'Mercadoria Geral da NF',
          unidade: 'UN',
          quantidadeNF: 1,
          quantidadeRecebida: 1,
          divergente: false
        }];

    setAlmoxConfirmData({
      dataRecebimentoAlmox: todayStr,
      recebidoPorAlmox: loggedUser.name,
      observacoesAlmox: item.observacoes || '',
      itensConferencia: baseItens
    });
    setAlmoxModalItem(item);
  };

  if (!loggedUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Controle de NFs v2.4</h1>
              <p className="text-xs text-slate-500">Selecione o seu perfil para entrar</p>
            </div>
          </div>

          <form onSubmit={handleProfileLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Usuário / Perfil
              </label>
              <select
                value={selectedLoginUserId}
                onChange={(e) => {
                  setSelectedLoginUserId(e.target.value);
                  setLoginError('');
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {appUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({ROLES_CONFIG[u.role]?.label || u.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Senha de Acesso (PIN)
              </label>
              <input
                type="password"
                inputMode="numeric"
                placeholder="Digite a sua senha (ex: 1236)"
                value={loginPinInput}
                onChange={(e) => {
                  setLoginPinInput(e.target.value);
                  setLoginError('');
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono tracking-widest text-center text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
              {loginError && (
                <p className="text-xs text-red-600 font-medium mt-1.5 text-center">{loginError}</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-sm transition text-sm flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" /> Entrar no Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20">
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-lg text-xs font-semibold text-white flex items-center gap-2 ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-700'
        }`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast.msg}</span>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 py-2 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={toggleFullScreen}
              title="Tela Cheia"
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-slate-800 truncate">Controle NFs <span className="text-[10px] text-emerald-600 font-mono">v2.4</span></span>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 truncate">
                  {loggedUser.name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {currentPermissions.isAdmin && (
              <>
                <button
                  onClick={() => setUsersModalOpen(true)}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1"
                  title="Gerenciar Usuários"
                >
                  <Users className="w-4 h-4" />
                  <span className="hidden md:inline">Usuários</span>
                </button>
                <button
                  onClick={() => setNeuralModalOpen(true)}
                  className="p-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-medium flex items-center gap-1"
                  title="Memória Neural"
                >
                  <Brain className="w-4 h-4" />
                  <span className="hidden md:inline">IA Neural</span>
                </button>
                {remessas.length > 0 && (
                  <button
                    onClick={() => setClearDbModalOpen(true)}
                    className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium flex items-center gap-1"
                    title="Zerar Base"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Nova NF</span>
            </button>

            <button
              onClick={handleLogout}
              title="Trocar Usuário / Sair"
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 pt-3 space-y-3">
        {/* FILTROS DE STATUS E BOTÕES DE EXPORTAÇÃO EXCEL / PDF */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setStatusFilter('TODOS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition flex items-center gap-1.5 ${
                statusFilter === 'TODOS'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              <span>Todas</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200/30 text-[11px]">{stats.total}</span>
            </button>

            <button
              onClick={() => setStatusFilter('PEND_ALMOX')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition flex items-center gap-1.5 ${
                statusFilter === 'PEND_ALMOX'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-amber-700 border-amber-200'
              }`}
            >
              <Warehouse className="w-3.5 h-3.5" />
              <span>Falta Almoxarifado</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 text-[11px]">{stats.pendAlmox}</span>
            </button>

            <button
              onClick={() => setStatusFilter('PEND_COMPRAS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition flex items-center gap-1.5 ${
                statusFilter === 'PEND_COMPRAS'
                  ? 'bg-red-600 text-white border-red-600'
                  : stats.pendCompras > 0
                    ? 'bg-red-50 text-red-700 border-red-300 animate-pulse'
                    : 'bg-white text-rose-700 border-rose-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Pendências Compras</span>
              <span className="px-1.5 py-0.2 rounded-full bg-red-100 text-red-900 text-[11px]">{stats.pendCompras}</span>
            </button>

            <button
              onClick={() => setStatusFilter('PEND_ESCRITORIO')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition flex items-center gap-1.5 ${
                statusFilter === 'PEND_ESCRITORIO'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-blue-700 border-blue-200'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Falta Escritório</span>
              <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-900 text-[11px]">{stats.pendOffice}</span>
            </button>

            <button
              onClick={() => setStatusFilter('CONCLUIDO')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap border transition flex items-center gap-1.5 ${
                statusFilter === 'CONCLUIDO'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-emerald-700 border-emerald-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Concluídas</span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900 text-[11px]">{stats.concluidos}</span>
            </button>
          </div>

          {/* BOTÕES DE RELATÓRIO EXCEL / PDF E PESQUISA AVANÇADA */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAdvancedSearch(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1 transition ${
                showAdvancedSearch || hasActiveAdvFilters
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Pesquisa Avançada</span>
              {hasActiveAdvFilters && <span className="w-2 h-2 rounded-full bg-amber-300" />}
            </button>

            <button
              type="button"
              onClick={handleExportExcelCSV}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1"
              title="Exportar lista filtrada para Excel (CSV)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 flex items-center gap-1"
              title="Gerar Relatório em PDF / Imprimir"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>PDF</span>
            </button>
          </div>
        </div>

        {/* BARRA DE BUSCA RÁPIDA */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Busca rápida: digite Nº da NF, chave de acesso, fornecedor, peça ou motorista..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* ABA / PAINEL DE PESQUISA AVANÇADA (POR DATA, Nº NF, FORNECEDOR, ITEM DA PEÇA) */}
        {showAdvancedSearch && (
          <div className="bg-white border border-emerald-200 rounded-2xl p-3.5 shadow-sm space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-emerald-600" />
                Filtros de Pesquisa Avançada ({filteredRemessas.length} resultado(s) encontrado(s))
              </span>
              <div className="flex items-center gap-2">
                {hasActiveAdvFilters && (
                  <button
                    type="button"
                    onClick={clearAdvancedFilters}
                    className="text-red-600 font-semibold hover:underline"
                  >
                    Limpar Filtros
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAdvancedSearch(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              <div>
                <label className="font-semibold text-slate-600">Nº da Nota Fiscal</label>
                <input
                  type="text"
                  placeholder="Ex: 14502"
                  value={advFilters.numeroNF}
                  onChange={(e) => setAdvFilters({ ...advFilters, numeroNF: e.target.value })}
                  className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600">Nome do Fornecedor</label>
                <input
                  type="text"
                  placeholder="Ex: Agrícola, John Deere..."
                  value={advFilters.fornecedor}
                  onChange={(e) => setAdvFilters({ ...advFilters, fornecedor: e.target.value })}
                  className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600">Item / Peça / Produto</label>
                <input
                  type="text"
                  placeholder="Ex: Rolamento, Filtro, Adubo..."
                  value={advFilters.itemPeca}
                  onChange={(e) => setAdvFilters({ ...advFilters, itemPeca: e.target.value })}
                  className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600">Setor na Fazenda</label>
                <select
                  value={advFilters.setor}
                  onChange={(e) => setAdvFilters({ ...advFilters, setor: e.target.value })}
                  className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="TODOS">Todos os Setores</option>
                  {SETORES_FAZENDA.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
              <div>
                <label className="font-semibold text-slate-600">Filtrar por qual Data?</label>
                <select
                  value={advFilters.tipoData}
                  onChange={(e) => setAdvFilters({ ...advFilters, tipoData: e.target.value })}
                  className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="EMISSAO">Data de Emissão da NF</option>
                  <option value="ENVIO">Data de Envio p/ Fazenda</option>
                  <option value="ALMOX">Data de Recebimento Almoxarifado</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-600">Data Inicial (De)</label>
                <input
                  type="date"
                  value={advFilters.dataInicio}
                  onChange={(e) => setAdvFilters({ ...advFilters, dataInicio: e.target.value })}
                  className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600">Data Final (Até)</label>
                <input
                  type="date"
                  value={advFilters.dataFim}
                  onChange={(e) => setAdvFilters({ ...advFilters, dataFim: e.target.value })}
                  className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
            Carregando controle de Notas Fiscais...
          </div>
        ) : filteredRemessas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Nenhuma Nota Fiscal encontrada neste filtro</p>
            <p className="text-xs text-slate-500">Clique em "+ Nova NF" no topo para fotografar ou anexar até 20 notas de uma vez.</p>
          </div>
        ) : (
          <>
            {/* VISÃO MOBILE (CARDS COM ITENS INDIVIDUAIS E CHAVE) */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {filteredRemessas.map(item => (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">NF {item.numeroNF}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                          item.foiComNota === 'SIM' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {item.foiComNota === 'SIM' ? 'Com NF' : 'Sem NF'}
                        </span>
                        {item.statusDivergenciaCompras === 'PENDENTE_COMPRAS' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700 flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> Divergência Qtd
                          </span>
                        )}
                        {item.statusDivergenciaCompras === 'APROVADA_COMPRAS' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-100 text-purple-700">
                            Qtd Validada Compras
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-700 truncate max-w-[240px]">{item.fornecedor}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-800">
                        {Number(item.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                      <p className="text-[10px] text-slate-400">Envio: {formatDateBR(item.dataEnvioFazenda)}</p>
                    </div>
                  </div>

                  {/* CHAVE DE ACESSO DA NF */}
                  {item.chaveAcesso && (
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-mono text-slate-600">
                      <span className="truncate"><Key className="w-3 h-3 inline mr-1 text-emerald-600" />{item.chaveAcesso}</span>
                      <button
                        type="button"
                        onClick={() => copyChaveToClipboard(item.chaveAcesso)}
                        className="ml-2 text-emerald-700 font-sans font-bold flex items-center gap-0.5 shrink-0"
                      >
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                  )}

                  {/* LISTA DE ITENS INDIVIDUAIS */}
                  {Array.isArray(item.itens) && item.itens.length > 0 ? (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2 space-y-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Package className="w-3 h-3" /> Itens da Nota ({item.itens.length})
                      </div>
                      {item.itens.map((it, idx) => {
                        const isDiff = Number(it.quantidadeRecebida ?? it.quantidadeNF) !== Number(it.quantidadeNF);
                        return (
                          <div key={it.id || idx} className="flex items-center justify-between text-xs border-b last:border-b-0 border-slate-200/60 py-1 gap-2">
                            <span className="text-slate-700 font-medium truncate">{it.descricao}</span>
                            <div className="shrink-0 flex items-center gap-1 font-mono text-[11px]">
                              <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                                NF: {it.quantidadeNF} {it.unidade || 'UN'}
                              </span>
                              {item.statusAlmoxarifado === 'RECEBIDO' && (
                                <span className={`px-1.5 py-0.5 rounded font-bold ${
                                  isDiff ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  Rec: {it.quantidadeRecebida ?? it.quantidadeNF}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : item.resumoMercadoria ? (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg line-clamp-2">
                      {item.resumoMercadoria}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Setor: <strong className="text-slate-700">{item.setorDestino}</strong></span>
                    <span>Portador: <strong className="text-slate-700">{item.portadorMotorista || '-'}</strong></span>
                  </div>

                  {/* BOTÃO DE PENDÊNCIA COMPRAS SE HOUVER DIVERGÊNCIA */}
                  {item.statusDivergenciaCompras === 'PENDENTE_COMPRAS' && (
                    <button
                      disabled={!currentPermissions.canApproveDivergence}
                      onClick={() => {
                        setComprasConfirmData({
                          parecerCompras: item.parecerCompras || '',
                          itensRevisados: (item.itens || []).map(i => ({ ...i }))
                        });
                        setComprasModalItem(item);
                      }}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                        currentPermissions.canApproveDivergence
                          ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                          : 'bg-red-50 text-red-500 border border-red-200 cursor-not-allowed'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                      {currentPermissions.canApproveDivergence
                        ? 'Confirmar Alteração de Quantidade (Compras)'
                        : 'Aguardando Confirmação do Compras'}
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                    {item.statusAlmoxarifado === 'RECEBIDO' ? (
                      <div
                        onClick={() => currentPermissions.canConfirmAlmox && openAlmoxModalForItem(item)}
                        className="bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 text-center cursor-pointer"
                      >
                        <div className="text-[10px] font-bold text-emerald-800 flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Almoxarifado OK
                        </div>
                        <div className="text-[10px] text-emerald-700">
                          {formatDateBR(item.dataRecebimentoAlmox)} • {item.recebidoPorAlmox}
                        </div>
                      </div>
                    ) : (
                      <button
                        disabled={!currentPermissions.canConfirmAlmox}
                        onClick={() => openAlmoxModalForItem(item)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${
                          currentPermissions.canConfirmAlmox
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Warehouse className="w-3.5 h-3.5" /> Conferir Itens Almox.
                      </button>
                    )}

                    {item.statusRetornoEscritorio === 'RECEBIDO' ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-1.5 text-center">
                        <div className="text-[10px] font-bold text-blue-800 flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Escritório OK
                        </div>
                        <div className="text-[10px] text-blue-700">
                          {formatDateBR(item.dataRetornoEscritorio)} • {item.recebidoPorEscritorio}
                        </div>
                      </div>
                    ) : (
                      <button
                        disabled={!currentPermissions.canConfirmOffice}
                        onClick={() => {
                          setOfficeConfirmData({
                            dataRetornoEscritorio: todayStr,
                            recebidoPorEscritorio: loggedUser.name,
                            observacoes: item.observacoes || ''
                          });
                          setOfficeModalItem(item);
                        }}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${
                          currentPermissions.canConfirmOffice
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Building2 className="w-3.5 h-3.5" /> Confirmar Escritório
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <button
                      type="button"
                      onClick={() => setHistoryModalItem(item)}
                      className="text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 text-[11px]"
                    >
                      <History className="w-3.5 h-3.5 text-slate-500" />
                      Histórico ({(item.historico || []).length})
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...item, itens: item.itens || [] });
                          setEditingId(item.id);
                          setIsFormOpen(true);
                        }}
                        className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-[11px]"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Editar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* VISÃO DESKTOP (TABELA COMPLETA COM ITENS, CHAVE E HISTÓRICO) */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-3 px-3">NF / Chave</th>
                    <th className="py-3 px-3">Fornecedor & Itens Individuais</th>
                    <th className="py-3 px-3">Envio / Destino</th>
                    <th className="py-3 px-3">1. Conferência Almoxarifado</th>
                    <th className="py-3 px-3">2. Retorno Escritório</th>
                    <th className="py-3 px-3 text-right">Histórico / Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredRemessas.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3 align-top max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900">NF {item.numeroNF}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.foiComNota === 'SIM' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {item.foiComNota === 'SIM' ? 'C/ NF' : 'S/ NF'}
                          </span>
                        </div>
                        <div className="text-slate-500 text-[11px]">Emissão: {formatDateBR(item.dataEmissaoNF)}</div>
                        <div className="font-semibold text-emerald-700 mt-0.5">
                          {Number(item.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                        {item.chaveAcesso && (
                          <div className="mt-1.5 bg-slate-100 border border-slate-200 rounded p-1 text-[10px] font-mono text-slate-600">
                            <div className="truncate" title={item.chaveAcesso}>{item.chaveAcesso}</div>
                            <button
                              type="button"
                              onClick={() => copyChaveToClipboard(item.chaveAcesso)}
                              className="text-emerald-700 font-sans font-bold flex items-center gap-1 mt-0.5 hover:underline"
                            >
                              <Copy className="w-3 h-3" /> Copiar Chave
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top max-w-md">
                        <div className="font-bold text-slate-800">{item.fornecedor}</div>
                        {Array.isArray(item.itens) && item.itens.length > 0 ? (
                          <div className="mt-1.5 space-y-1 bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                            {item.itens.map((it, idx) => {
                              const isDiff = Number(it.quantidadeRecebida ?? it.quantidadeNF) !== Number(it.quantidadeNF);
                              return (
                                <div key={it.id || idx} className="flex items-center justify-between gap-2 text-[11px] border-b last:border-b-0 border-slate-200/60 pb-1 last:pb-0">
                                  <span className="font-medium text-slate-700">{it.descricao}</span>
                                  <div className="flex items-center gap-1 shrink-0 font-mono">
                                    <span className="px-1.5 py-0.5 bg-white border rounded text-slate-700">
                                      NF: {it.quantidadeNF} {it.unidade || 'UN'}
                                    </span>
                                    {item.statusAlmoxarifado === 'RECEBIDO' && (
                                      <span className={`px-1.5 py-0.5 rounded font-bold ${
                                        isDiff ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-emerald-100 text-emerald-800'
                                      }`}>
                                        Rec: {it.quantidadeRecebida ?? it.quantidadeNF}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-slate-500 mt-1">{item.resumoMercadoria || '-'}</div>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top">
                        <div className="font-medium text-slate-800">{item.setorDestino}</div>
                        <div className="text-slate-500">Envio: {formatDateBR(item.dataEnvioFazenda)}</div>
                        <div className="text-slate-500">Portador: {item.portadorMotorista || '-'}</div>
                      </td>

                      <td className="py-3 px-3 align-top space-y-1.5">
                        {item.statusAlmoxarifado === 'RECEBIDO' ? (
                          <div className="text-emerald-700">
                            <div className="font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Conferido
                            </div>
                            <div className="text-[11px]">Data: {formatDateBR(item.dataRecebimentoAlmox)}</div>
                            <div className="text-[11px]">Por: {item.recebidoPorAlmox}</div>
                            {currentPermissions.canConfirmAlmox && (
                              <button
                                type="button"
                                onClick={() => openAlmoxModalForItem(item)}
                                className="mt-1 text-[11px] text-emerald-800 underline font-semibold"
                              >
                                Rever Quantidades
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            disabled={!currentPermissions.canConfirmAlmox}
                            onClick={() => openAlmoxModalForItem(item)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                              currentPermissions.canConfirmAlmox
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <Warehouse className="w-3.5 h-3.5" /> Conferir Itens
                          </button>
                        )}

                        {item.statusDivergenciaCompras === 'PENDENTE_COMPRAS' && (
                          <div className="pt-1">
                            <button
                              disabled={!currentPermissions.canApproveDivergence}
                              onClick={() => {
                                setComprasConfirmData({
                                  parecerCompras: item.parecerCompras || '',
                                  itensRevisados: (item.itens || []).map(i => ({ ...i }))
                                });
                                setComprasModalItem(item);
                              }}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                                currentPermissions.canApproveDivergence
                                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                                  : 'bg-red-50 text-red-600 border border-red-200 cursor-not-allowed'
                              }`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {currentPermissions.canApproveDivergence ? 'Confirmar Qtd (Compras)' : 'Pendência Compras'}
                            </button>
                          </div>
                        )}

                        {item.statusDivergenciaCompras === 'APROVADA_COMPRAS' && (
                          <div className="text-[11px] text-purple-700 font-semibold bg-purple-50 border border-purple-200 rounded px-2 py-1">
                            ✓ Divergência validada ({item.aprovadoComprasPor})
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top">
                        {item.statusRetornoEscritorio === 'RECEBIDO' ? (
                          <div className="text-blue-700">
                            <div className="font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Retornou
                            </div>
                            <div className="text-[11px]">Data: {formatDateBR(item.dataRetornoEscritorio)}</div>
                            <div className="text-[11px]">Por: {item.recebidoPorEscritorio}</div>
                          </div>
                        ) : (
                          <button
                            disabled={!currentPermissions.canConfirmOffice}
                            onClick={() => {
                              setOfficeConfirmData({
                                dataRetornoEscritorio: todayStr,
                                recebidoPorEscritorio: loggedUser.name,
                                observacoes: item.observacoes || ''
                              });
                              setOfficeModalItem(item);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                              currentPermissions.canConfirmOffice
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <Building2 className="w-3.5 h-3.5" /> Confirmar Escritório
                          </button>
                        )}
                      </td>

                      <td className="py-3 px-3 align-top text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setHistoryModalItem(item)}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1"
                            title="Ver Histórico de Alterações"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>{(item.historico || []).length}</span>
                          </button>
                          <button
                            onClick={() => {
                              setFormData({ ...item, itens: item.itens || [] });
                              setEditingId(item.id);
                              setIsFormOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {currentPermissions.isAdmin && (
                            <button
                              onClick={() => handleDeleteRemessa(item.id)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* MODAL: NOVO DESPACHO / EDIÇÃO (COM CÂMERA NATIVA DIRETA E LOTE ATÉ 20 NOTAS) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 flex items-start justify-center p-2 pt-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 shadow-xl mb-20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800">
                {editingId ? 'Editar Registro de NF' : 'Novo Despacho de Mercadoria (v2.4)'}
              </h2>
              <button onClick={resetForm} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
              <div className="grid grid-cols-2 gap-2">
                {/* Botão abre DIRETO a câmera nativa original do celular */}
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  disabled={isScanning}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm"
                >
                  <Camera className="w-4 h-4" /> Tirar Foto (Câmera)
                </button>
                {/* Botão permite selecionar de 1 até 20 fotos/PDFs da galeria */}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={isScanning}
                  className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-2"
                >
                  <Layers className="w-4 h-4 text-emerald-600" /> Galeria / PDF (Até 20)
                </button>
              </div>
              <p className="text-[10px] text-slate-500 text-center mt-1.5">
                Dica: Na Galeria, você pode selecionar até <strong>20 notas de uma só vez</strong> para leitura em fila e confirmação posterior.
              </p>

              {/* Input Galeria com seleção múltipla (até 20) */}
              <input
                ref={galleryInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={handleFilesSelected}
                className="hidden"
              />
              {/* Input Câmera Nativa Direta */}
              <input
                ref={nativeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFilesSelected}
                className="hidden"
              />

              {isScanning && (
                <div className="mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-800">
                  <RefreshCw className="w-4 h-4 animate-spin" /> {scanMessage}
                </div>
              )}
              {lastAiError && (
                <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                  <strong>Diagnóstico v2.4:</strong> {lastAiError}
                </div>
              )}
              {neuralSuggestionBanner && (
                <div className="mt-2 text-[11px] text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" /> {neuralSuggestionBanner}
                </div>
              )}
            </div>

            <form onSubmit={handleSaveRemessa} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-600">Nº da NF *</label>
                  <input
                    type="text"
                    required
                    value={formData.numeroNF}
                    onChange={(e) => setFormData({ ...formData, numeroNF: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600">Valor Total (R$)</label>
                  <input
                    type="text"
                    value={formData.valorTotal}
                    onChange={(e) => setFormData({ ...formData, valorTotal: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="font-semibold text-slate-600">Data Emissão NF</label>
                  <input
                    type="date"
                    value={formData.dataEmissaoNF}
                    onChange={(e) => setFormData({ ...formData, dataEmissaoNF: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-600">Fornecedor *</label>
                  <input
                    type="text"
                    required
                    value={formData.fornecedor}
                    onChange={(e) => setFormData({ ...formData, fornecedor: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 flex items-center justify-between">
                    <span>Chave de Acesso da NF (44 dígitos)</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {String(formData.chaveAcesso || '').replace(/\D/g, '').length}/44
                    </span>
                  </label>
                  <input
                    type="text"
                    placeholder="Extraída automaticamente da NF ou digite..."
                    value={formData.chaveAcesso}
                    onChange={(e) => setFormData({ ...formData, chaveAcesso: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* SEÇÃO DE ITENS INDIVIDUAIS DA NOTA FISCAL */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-emerald-600" />
                    Itens Individuais da Nota ({(formData.itens || []).length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddFormItem}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[11px] flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Item
                  </button>
                </div>

                {(formData.itens || []).length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-2">
                    Os itens aparecerão aqui automaticamente ao ler a NF, ou clique em "+ Adicionar Item".
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(formData.itens || []).map((it, idx) => (
                      <div key={it.id || idx} className="grid grid-cols-12 gap-1.5 items-center bg-white p-2 rounded-lg border border-slate-200">
                        <div className="col-span-6 sm:col-span-7">
                          <input
                            type="text"
                            placeholder="Descrição do item / produto"
                            value={it.descricao}
                            onChange={(e) => handleUpdateFormItem(idx, 'descricao', e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <input
                            type="number"
                            step="any"
                            placeholder="Qtd"
                            value={it.quantidadeNF}
                            onChange={(e) => handleUpdateFormItem(idx, 'quantidadeNF', e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono text-center"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-2">
                          <input
                            type="text"
                            placeholder="UN"
                            value={it.unidade}
                            onChange={(e) => handleUpdateFormItem(idx, 'unidade', e.target.value.toUpperCase())}
                            className="w-full px-1.5 py-1.5 border border-slate-300 rounded text-xs font-mono text-center uppercase"
                          />
                        </div>
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveFormItem(idx)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
                <div>
                  <label className="font-semibold text-slate-600">Setor na Fazenda</label>
                  <select
                    value={formData.setorDestino}
                    onChange={(e) => setFormData({ ...formData, setorDestino: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {SETORES_FAZENDA.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-600">Motorista / Portador</label>
                  <input
                    type="text"
                    value={formData.portadorMotorista}
                    onChange={(e) => setFormData({ ...formData, portadorMotorista: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600">Mercadoria foi c/ Nota?</label>
                  <select
                    value={formData.foiComNota}
                    onChange={(e) => setFormData({ ...formData, foiComNota: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    <option value="SIM">SIM - Foi com a NF</option>
                    <option value="NAO">NÃO - Sem NF física</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                >
                  Salvar Despacho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROCESSAMENTO E REVISÃO EM LOTE (ATÉ 20 NOTAS FISCAIS) */}
      {batchQueueModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-start justify-center p-2 pt-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-4 shadow-2xl space-y-3 mb-20 text-xs">
            <div className="flex items-center justify-between border-b pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  Processamento em Lote ({batchItems.length} Nota(s) Selecionada(s))
                </h3>
                <p className="text-[11px] text-slate-500">
                  As notas são lidas uma a uma pela IA. Revise os campos abaixo e clique em Confirmar Todas.
                </p>
              </div>
              {!batchProgress.active && (
                <button onClick={() => setBatchQueueModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* BARRA DE PROGRESSO DA FILA */}
            {batchProgress.active && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-emerald-900">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    Lendo Nota Fiscal {batchProgress.current} de {batchProgress.total}...
                  </span>
                  <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-emerald-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* CONFIGURAÇÃO PADRÃO PARA APLICAR A TODAS DO LOTE */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="font-semibold text-slate-600 text-[11px]">Setor Padrão do Lote</label>
                <select
                  value={batchGlobalConfig.setorDestino}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBatchGlobalConfig(prev => ({ ...prev, setorDestino: val }));
                    setBatchItems(prev => prev.map(it => ({ ...it, setorDestino: val })));
                  }}
                  className="w-full mt-0.5 px-2 py-1.5 border rounded-lg bg-white"
                >
                  {SETORES_FAZENDA.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-600 text-[11px]">Motorista / Portador Padrão</label>
                <input
                  type="text"
                  placeholder="Aplicar a todas as notas..."
                  value={batchGlobalConfig.portadorMotorista}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBatchGlobalConfig(prev => ({ ...prev, portadorMotorista: val }));
                    setBatchItems(prev => prev.map(it => ({ ...it, portadorMotorista: val })));
                  }}
                  className="w-full mt-0.5 px-2 py-1.5 border rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600 text-[11px]">Mercadoria foi c/ Nota?</label>
                <select
                  value={batchGlobalConfig.foiComNota}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBatchGlobalConfig(prev => ({ ...prev, foiComNota: val }));
                    setBatchItems(prev => prev.map(it => ({ ...it, foiComNota: val })));
                  }}
                  className="w-full mt-0.5 px-2 py-1.5 border rounded-lg bg-white font-semibold"
                >
                  <option value="SIM">SIM - Foi com a NF</option>
                  <option value="NAO">NÃO - Sem NF física</option>
                </select>
              </div>
            </div>

            {/* LISTA DE NOTAS DO LOTE PARA CONFERÊNCIA POSTERIOR */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {batchItems.map((bItem, idx) => (
                <div
                  key={bItem.tempId}
                  className={`p-2.5 rounded-xl border transition ${
                    bItem.status === 'PRONTO'
                      ? 'bg-white border-slate-200'
                      : bItem.status === 'ERRO'
                        ? 'bg-red-50/60 border-red-200'
                        : 'bg-slate-50 border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={bItem.selected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: checked } : it));
                        }}
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                      <span className="font-bold text-slate-700">
                        #{idx + 1} • {bItem.fileName}
                      </span>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      bItem.status === 'PRONTO' ? 'bg-emerald-100 text-emerald-800' :
                      bItem.status === 'LENDO' ? 'bg-amber-100 text-amber-800' :
                      bItem.status === 'ERRO' ? 'bg-red-100 text-red-800' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {bItem.status === 'PRONTO' ? `✓ Lida (${(bItem.itens || []).length} itens)` :
                       bItem.status === 'LENDO' ? 'Lendo IA...' :
                       bItem.status === 'ERRO' ? 'Preencher Manual' : 'Na fila'}
                    </span>
                  </div>

                  {bItem.errorMsg && (
                    <p className="text-[10px] text-red-600 mb-1.5">{bItem.errorMsg}</p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold">Nº da NF *</label>
                      <input
                        type="text"
                        placeholder="Nº NF"
                        value={bItem.numeroNF}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, numeroNF: val } : it));
                        }}
                        className="w-full px-2 py-1 border rounded bg-white"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="text-[10px] text-slate-500 font-semibold">Fornecedor *</label>
                      <input
                        type="text"
                        placeholder="Nome do Fornecedor"
                        value={bItem.fornecedor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, fornecedor: val } : it));
                        }}
                        className="w-full px-2 py-1 border rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-semibold">Valor Total (R$)</label>
                      <input
                        type="text"
                        placeholder="0.00"
                        value={bItem.valorTotal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBatchItems(prev => prev.map((it, i) => i === idx ? { ...it, valorTotal: val } : it));
                        }}
                        className="w-full px-2 py-1 border rounded bg-white font-mono"
                      />
                    </div>
                  </div>

                  {bItem.chaveAcesso && (
                    <div className="mt-1.5 text-[10px] font-mono text-slate-500 truncate">
                      Chave: {bItem.chaveAcesso}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-slate-600 font-semibold">
                {batchItems.filter(i => i.selected && i.numeroNF && i.fornecedor).length} nota(s) pronta(s) para salvar
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={batchProgress.active}
                  onClick={() => setBatchQueueModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={batchProgress.active}
                  onClick={handleSaveBatchAll}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-bold rounded-xl shadow-sm"
                >
                  Confirmar e Salvar Todas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFERÊNCIA DE ITENS NO ALMOXARIFADO COM BOTÕES + E - */}
      {almoxModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-2 pt-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 shadow-xl space-y-3 mb-16">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
                <Warehouse className="w-4 h-4" /> Conferência de Recebimento no Almoxarifado
              </h3>
              <button onClick={() => setAlmoxModalItem(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-600">
              NF <strong>{almoxModalItem.numeroNF}</strong> • {almoxModalItem.fornecedor}
            </p>

            <form onSubmit={handleConfirmAlmox} className="space-y-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">Confira a quantidade recebida de cada item:</span>
                  <span className="text-[10px] text-slate-500">Use - ou + para ajustar</span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(almoxConfirmData.itensConferencia || []).map((it, idx) => {
                    const isDiff = Number(it.quantidadeRecebida) !== Number(it.quantidadeNF);
                    return (
                      <div
                        key={it.id || idx}
                        className={`p-2.5 rounded-xl border transition ${
                          isDiff ? 'bg-amber-50/90 border-amber-300' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-slate-800">{it.descricao}</span>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                            Qtd NF: <strong>{it.quantidadeNF} {it.unidade || 'UN'}</strong>
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-600">
                            {isDiff ? (
                              <strong className="text-amber-800 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Vai gerar pendência p/ Compras
                              </strong>
                            ) : (
                              'Quantidade recebida física:'
                            )}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => adjustAlmoxItemQty(idx, -1)}
                              className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold flex items-center justify-center"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              step="any"
                              value={it.quantidadeRecebida}
                              onChange={(e) => setAlmoxItemQtyDirect(idx, e.target.value)}
                              className="w-16 h-8 text-center font-mono font-bold border border-slate-300 rounded-lg bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => adjustAlmoxItemQty(idx, 1)}
                              className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700">Data do Recebimento *</label>
                  <input
                    type="date"
                    required
                    value={almoxConfirmData.dataRecebimentoAlmox}
                    onChange={(e) => setAlmoxConfirmData({ ...almoxConfirmData, dataRecebimentoAlmox: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Conferido por (Almoxarife) *</label>
                  <input
                    type="text"
                    required
                    value={almoxConfirmData.recebidoPorAlmox}
                    onChange={(e) => setAlmoxConfirmData({ ...almoxConfirmData, recebidoPorAlmox: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Observação da Conferência (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Produto chegou molhado, caixa avariada, etc."
                  value={almoxConfirmData.observacoesAlmox}
                  onChange={(e) => setAlmoxConfirmData({ ...almoxConfirmData, observacoesAlmox: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAlmoxModalItem(null)} className="px-3 py-2 border rounded-lg">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg shadow-sm">
                  Salvar Conferência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE DIVERGÊNCIA PELO COMPRAS */}
      {comprasModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-2 pt-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 shadow-xl space-y-3 mb-16">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Pendência Compras: Divergência de Quantidade
              </h3>
              <button onClick={() => setComprasModalItem(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <p className="text-xs text-slate-600">
              NF <strong>{comprasModalItem.numeroNF}</strong> • {comprasModalItem.fornecedor} <br />
              Conferido no Almoxarifado por <strong>{comprasModalItem.recebidoPorAlmox}</strong> em {formatDateBR(comprasModalItem.dataRecebimentoAlmox)}.
            </p>

            <form onSubmit={handleApproveDivergenceCompras} className="space-y-3 text-xs">
              <div className="bg-red-50/60 border border-red-200 rounded-xl p-2.5 space-y-2 max-h-60 overflow-y-auto">
                {(comprasConfirmData.itensRevisados || []).map((it, idx) => {
                  const isDiff = Number(it.quantidadeRecebida) !== Number(it.quantidadeNF);
                  return (
                    <div key={it.id || idx} className={`p-2 rounded-lg border ${isDiff ? 'bg-white border-red-300' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="font-bold text-slate-800">{it.descricao}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-mono text-[11px] text-slate-600">
                          Nota Fiscal: <strong>{it.quantidadeNF} {it.unidade || 'UN'}</strong>
                        </span>
                        <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                          isDiff ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          Recebido Fazenda: {it.quantidadeRecebida} {it.unidade || 'UN'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="font-semibold text-slate-700">Parecer / Providência do Setor de Compras *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ex: Fornecedor ciente, enviará reposição na próxima entrega / Nota complementar emitida..."
                  value={comprasConfirmData.parecerCompras}
                  onChange={(e) => setComprasConfirmData({ ...comprasConfirmData, parecerCompras: e.target.value })}
                  className="w-full mt-1 p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setComprasModalItem(null)} className="px-3 py-2 border rounded-lg">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-sm">
                  Confirmar e Resolver Pendência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTÓRICO DE REGISTROS E ALTERAÇÕES */}
      {historyModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-2 pt-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 shadow-xl space-y-3 mb-16">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-600" /> Histórico de Auditoria — NF {historyModalItem.numeroNF}
              </h3>
              <button onClick={() => setHistoryModalItem(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1">
              <div><strong>Fornecedor:</strong> {historyModalItem.fornecedor}</div>
              <div><strong>Chave de Acesso:</strong> <span className="font-mono text-[11px]">{historyModalItem.chaveAcesso || 'Não registrada'}</span></div>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 text-xs">
              {(historyModalItem.historico || []).length === 0 ? (
                <p className="text-center text-slate-400 py-4">Nenhum evento detalhado registrado ainda.</p>
              ) : (
                [...(historyModalItem.historico || [])].reverse().map((h, i) => (
                  <div key={h.id || i} className="border-l-2 border-emerald-500 pl-3 py-1 bg-slate-50/60 rounded-r-lg">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-bold text-slate-800">{h.usuario} {h.perfil ? `(${h.perfil})` : ''}</span>
                      <span className="font-mono">{formatDateTimeBR(h.dataHora)}</span>
                    </div>
                    <div className="font-semibold text-emerald-800 mt-0.5">{h.acao}</div>
                    {h.detalhes && <div className="text-slate-600 text-[11px] mt-0.5">{h.detalhes}</div>}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button onClick={() => setHistoryModalItem(null)} className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg">
                Fechar Histórico
              </button>
            </div>
          </div>
        </div>
      )}

      {officeModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-blue-800 flex items-center gap-1.5">
                <Building2 className="w-4 h-4" /> Confirmar Retorno da NF ao Escritório
              </h3>
              <button onClick={() => setOfficeModalItem(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-600">
              NF <strong>{officeModalItem.numeroNF}</strong> • {officeModalItem.fornecedor}
            </p>
            <form onSubmit={handleConfirmOffice} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Data de Retorno ao Escritório *</label>
                <input
                  type="date"
                  required
                  value={officeConfirmData.dataRetornoEscritorio}
                  onChange={(e) => setOfficeConfirmData({ ...officeConfirmData, dataRetornoEscritorio: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Conferido por *</label>
                <input
                  type="text"
                  required
                  value={officeConfirmData.recebidoPorEscritorio}
                  onChange={(e) => setOfficeConfirmData({ ...officeConfirmData, recebidoPorEscritorio: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOfficeModalItem(null)} className="px-3 py-2 border rounded-lg">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg">
                  Confirmar no Escritório
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {usersModalOpen && currentPermissions.isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-3 pt-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-600" /> Cadastro de Usuários e Senhas
              </h3>
              <button onClick={() => setUsersModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border text-xs">
              <input
                type="text"
                placeholder="Nome do colaborador"
                required
                value={newUserForm.name}
                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                className="px-2.5 py-2 border rounded-lg bg-white"
              />
              <select
                value={newUserForm.role}
                onChange={(e) => setNewUserForm({
                  ...newUserForm,
                  role: e.target.value,
                  pin: ROLES_CONFIG[e.target.value]?.defaultPin || '1234'
                })}
                className="px-2.5 py-2 border rounded-lg bg-white"
              >
                <option value="compras">Compras</option>
                <option value="auxiliar">Auxiliar de Escritório</option>
                <option value="almoxarife">Almoxarife</option>
                <option value="admin">Administrador</option>
              </select>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="PIN"
                  value={newUserForm.pin}
                  onChange={(e) => setNewUserForm({ ...newUserForm, pin: e.target.value })}
                  className="w-20 px-2.5 py-2 border rounded-lg bg-white font-mono text-center"
                />
                <button type="submit" className="flex-1 bg-emerald-600 text-white font-semibold rounded-lg px-3">
                  Adicionar
                </button>
              </div>
            </form>

            <div className="divide-y border rounded-xl max-h-64 overflow-y-auto text-xs">
              {appUsers.map(u => (
                <div key={u.id} className="p-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800">{u.name}</div>
                    <div className="text-slate-500">
                      Perfil: {ROLES_CONFIG[u.role]?.label} • Senha PIN: <strong className="font-mono">{u.pin}</strong>
                    </div>
                  </div>
                  {u.id !== 'u_admin' && (
                    <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 p-1 hover:bg-red-50 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {neuralModalOpen && currentPermissions.isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-start justify-center p-3 pt-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 shadow-xl space-y-3 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-purple-900 flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-purple-600" /> Sistema Neural & Chave IA
              </h3>
              <button onClick={() => setNeuralModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div>
              <label className="font-semibold text-slate-700">Diretrizes Neurais de Leitura de NF:</label>
              <textarea
                rows={3}
                value={neuralMemory.customRules || ''}
                onChange={(e) => setNeuralMemory({ ...neuralMemory, customRules: e.target.value })}
                className="w-full mt-1 p-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700">Chave Gemini API:</label>
              <input
                type="text"
                placeholder="Cole aqui a sua chave da API Gemini"
                value={neuralMemory.customGeminiKey || ''}
                onChange={(e) => setNeuralMemory({ ...neuralMemory, customGeminiKey: e.target.value })}
                className="w-full mt-1 p-2 border rounded-lg font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={async () => {
                  const neuralDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'sistema_neural', 'config_principal');
                  await setDoc(neuralDocRef, neuralMemory, { merge: true });
                  setNeuralModalOpen(false);
                  showToast('Memória Neural atualizada!');
                }}
                className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg"
              >
                Salvar Configurações Neurais
              </button>
            </div>
          </div>
        </div>
      )}

      {clearDbModalOpen && currentPermissions.isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 shadow-xl space-y-3 text-center">
            <Trash2 className="w-8 h-8 text-red-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Zerar Base de Dados?</h3>
            <p className="text-xs text-slate-600">
              Todos os {remessas.length} registros serão apagados permanentemente.
            </p>
            <div className="flex justify-center gap-2 pt-2 text-xs">
              <button onClick={() => setClearDbModalOpen(false)} className="px-4 py-2 border rounded-lg">
                Cancelar
              </button>
              <button onClick={handleClearAllDatabase} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg">
                Confirmar e Zerar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
