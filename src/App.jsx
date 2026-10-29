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
  Edit3
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
  compras: { label: 'Compras', defaultPin: '1236', canDispatch: true, canConfirmAlmox: false, canConfirmOffice: true, isAdmin: false },
  auxiliar: { label: 'Auxiliar de Escritório', defaultPin: '4321', canDispatch: true, canConfirmAlmox: false, canConfirmOffice: true, isAdmin: false },
  almoxarife: { label: 'Almoxarife', defaultPin: '5678', canDispatch: true, canConfirmAlmox: true, canConfirmOffice: false, isAdmin: false },
  admin: { label: 'Administrador', defaultPin: '1234', canDispatch: true, canConfirmAlmox: true, canConfirmOffice: true, isAdmin: true }
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

// Comprime a imagem antes de enviar à IA para leitura rápida no telemóvel/computador
const compressImageDataUrl = (dataUrl, maxWidth = 1400) => {
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
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
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
  const [clearDbModalOpen, setClearDbModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [neuralModalOpen, setNeuralModalOpen] = useState(false);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoElementRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [lastAiError, setLastAiError] = useState('');
  const [neuralSuggestionBanner, setNeuralSuggestionBanner] = useState('');
  const [toast, setToast] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');

  const todayStr = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    numeroNF: '',
    serieNF: '',
    fornecedor: '',
    cnpjFornecedor: '',
    dataEmissaoNF: todayStr,
    valorTotal: '',
    resumoMercadoria: '',
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
    observacoes: '',
    anexoPreview: ''
  });

  const [almoxConfirmData, setAlmoxConfirmData] = useState({
    dataRecebimentoAlmox: todayStr,
    recebidoPorAlmox: '',
    observacoesAlmox: ''
  });

  const [officeConfirmData, setOfficeConfirmData] = useState({
    dataRetornoEscritorio: todayStr,
    recebidoPorEscritorio: '',
    observacoes: ''
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

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setCameraReady(false);
  };

  const openLiveCamera = async () => {
    setCameraError('');
    setCameraReady(false);
    setIsCameraOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1080 },
          height: { ideal: 1920 }
        },
        audio: false
      });
      mediaStreamRef.current = stream;
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = stream;
        await videoElementRef.current.play().catch(() => {});
        setCameraReady(true);
      }
    } catch (err) {
      console.warn('Erro câmara:', err);
      setCameraError('Permissão de câmara bloqueada ou indisponível. Use o botão Galeria.');
    }
  };

  const setVideoRef = (node) => {
    videoElementRef.current = node;
    if (node && mediaStreamRef.current) {
      node.srcObject = mediaStreamRef.current;
      node.play().then(() => setCameraReady(true)).catch(() => {});
    }
  };

  const closeLiveCamera = () => {
    stopCameraStream();
    setIsCameraOpen(false);
  };

  const capturePhotoFromVideo = () => {
    const video = videoElementRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1440;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    closeLiveCamera();
    processDataUrlWithGemini(dataUrl, 'image/jpeg');
  };

  const applyNeuralMemoryToSupplier = (fornecedorNome, cnpj) => {
    const key = (cnpj || fornecedorNome || '').replace(/\D/g, '') || (fornecedorNome || '').toUpperCase().trim();
    if (!key) return {};
    const learned = neuralMemory.supplierLearnings?.[key];
    if (learned) {
      setNeuralSuggestionBanner(`Memória Neural: Fornecedor reconhecido! Setor (${learned.setorDestino}) preenchido.`);
      return {
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
  // LEITURA DE NOTA FISCAL COMPATÍVEL COM CHAVES DO PAINEL NEURAL
  // ==========================================================================
  const processDataUrlWithGemini = async (rawDataUrl, mimeType) => {
    setIsScanning(true);
    setLastAiError('');
    setScanMessage('Otimizando imagem e lendo Nota Fiscal com IA...');

    try {
      const optimizedUrl = await compressImageDataUrl(rawDataUrl);
      const base64Data = optimizedUrl.split(',')[1];
      const finalMime = optimizedUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : mimeType;

      const savedKey = (neuralMemory.customGeminiKey || '').trim();
      const candidateKeys = [];
      if (savedKey) candidateKeys.push(savedKey);
      if (!candidateKeys.includes(firebaseConfig.apiKey)) candidateKeys.push(firebaseConfig.apiKey);

      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

      const prompt = `Você é um assistente especialista em leitura de Notas Fiscais brasileiras (DANFE / NF-e) para gestão de fazenda.
Contexto neural: ${neuralMemory.customRules || ''}
Extraia os campos da Nota Fiscal na imagem ou PDF e retorne APENAS um objeto JSON válido com estas chaves:
{
  "numeroNF": "string",
  "serieNF": "string",
  "fornecedor": "string",
  "cnpjFornecedor": "string",
  "dataEmissaoNF": "YYYY-MM-DD",
  "valorTotal": "string numérica com ponto decimal ex 1450.50",
  "resumoMercadoria": "string resumindo os produtos",
  "chaveAcesso": "string"
}`;

      let parsedData = null;
      let detailedError = '';

      outerLoop:
      for (const keyToUse of candidateKeys) {
        for (const modelName of modelsToTry) {
          try {
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
                    role: 'user',
                    parts: [
                      { text: prompt },
                      { inlineData: { mimeType: finalMime, data: base64Data } }
                    ]
                  }],
                  generationConfig: { responseMimeType: 'application/json' }
                })
              }
            );

            const resJson = await response.json();

            if (!response.ok) {
              detailedError = resJson?.error?.message || `HTTP ${response.status}`;
              continue;
            }

            let rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            parsedData = JSON.parse(rawText);
            break outerLoop;
          } catch (innerErr) {
            detailedError = innerErr.message || 'Erro de conexão';
          }
        }
      }

      if (!parsedData) {
        throw new Error(detailedError || 'API Gemini não respondeu');
      }

      const neuralFill = applyNeuralMemoryToSupplier(parsedData.fornecedor, parsedData.cnpjFornecedor);

      setFormData(prev => ({
        ...prev,
        numeroNF: parsedData.numeroNF || prev.numeroNF,
        serieNF: parsedData.serieNF || prev.serieNF,
        fornecedor: parsedData.fornecedor || prev.fornecedor,
        cnpjFornecedor: parsedData.cnpjFornecedor || prev.cnpjFornecedor,
        dataEmissaoNF: parsedData.dataEmissaoNF || prev.dataEmissaoNF,
        valorTotal: parsedData.valorTotal ? String(parsedData.valorTotal) : prev.valorTotal,
        resumoMercadoria: parsedData.resumoMercadoria || prev.resumoMercadoria,
        chaveAcesso: parsedData.chaveAcesso || prev.chaveAcesso,
        setorDestino: neuralFill.setorDestino || prev.setorDestino,
        portadorMotorista: neuralFill.portadorMotorista || prev.portadorMotorista,
        anexoPreview: 'ANEXADO'
      }));

      showToast('Dados da NF extraídos automaticamente!');
    } catch (err) {
      console.error('Erro detalhado na leitura IA:', err);
      setLastAiError(err.message || 'Erro desconhecido');
      showToast('Falha na leitura automática. Veja o detalhe abaixo dos botões.', 'error');
    } finally {
      setIsScanning(false);
      setScanMessage('');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => processDataUrlWithGemini(reader.result, file.type || 'image/jpeg');
    reader.readAsDataURL(file);
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
      const payload = {
        ...formData,
        valorTotal: parseFloat(String(formData.valorTotal).replace(',', '.')) || 0,
        lancadoPor: loggedUser?.name || 'Usuário',
        updatedAt: Date.now()
      };

      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', editingId), payload);
        showToast('Registo atualizado!');
      } else {
        await addDoc(colRef, { ...payload, createdAt: Date.now() });
        showToast('Despacho registado com sucesso!');
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
      observacoes: '',
      anexoPreview: ''
    });
    setNeuralSuggestionBanner('');
    setLastAiError('');
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleConfirmAlmox = async (e) => {
    e.preventDefault();
    if (!almoxModalItem) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', almoxModalItem.id);
      await updateDoc(docRef, {
        statusAlmoxarifado: 'RECEBIDO',
        dataRecebimentoAlmox: almoxConfirmData.dataRecebimentoAlmox,
        recebidoPorAlmox: almoxConfirmData.recebidoPorAlmox || loggedUser?.name || 'Almoxarife',
        observacoes: almoxConfirmData.observacoesAlmox || almoxModalItem.observacoes || '',
        updatedAt: Date.now()
      });
      setAlmoxModalItem(null);
      showToast('Recebimento no Almoxarifado confirmado!');
    } catch {
      showToast('Erro ao confirmar Almoxarifado.', 'error');
    }
  };

  const handleConfirmOffice = async (e) => {
    e.preventDefault();
    if (!officeModalItem) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'remessas_nf', officeModalItem.id);
      await updateDoc(docRef, {
        statusRetornoEscritorio: 'RECEBIDO',
        dataRetornoEscritorio: officeConfirmData.dataRetornoEscritorio,
        recebidoPorEscritorio: officeConfirmData.recebidoPorEscritorio || loggedUser?.name || 'Escritório',
        observacoes: officeConfirmData.observacoes || officeModalItem.observacoes || '',
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
      showToast('Registo excluído.');
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
    showToast('Utilizador cadastrado!');
  };

  const handleDeleteUser = async (uId) => {
    if (uId === 'u_admin') {
      showToast('O Administrador principal não pode ser removido.', 'error');
      return;
    }
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema', uId));
    showToast('Utilizador removido.');
  };

  const stats = useMemo(() => {
    const total = remessas.length;
    const pendAlmox = remessas.filter(r => r.statusAlmoxarifado !== 'RECEBIDO').length;
    const pendOffice = remessas.filter(r => r.statusRetornoEscritorio !== 'RECEBIDO').length;
    const concluidos = remessas.filter(r => r.statusAlmoxarifado === 'RECEBIDO' && r.statusRetornoEscritorio === 'RECEBIDO').length;
    return { total, pendAlmox, pendOffice, concluidos };
  }, [remessas]);

  const filteredRemessas = useMemo(() => {
    return remessas.filter(r => {
      const matchesSearch = 
        (r.numeroNF || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.fornecedor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.resumoMercadoria || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.portadorMotorista || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;
      if (statusFilter === 'PEND_ALMOX') return r.statusAlmoxarifado !== 'RECEBIDO';
      if (statusFilter === 'PEND_ESCRITORIO') return r.statusRetornoEscritorio !== 'RECEBIDO';
      if (statusFilter === 'CONCLUIDO') return r.statusAlmoxarifado === 'RECEBIDO' && r.statusRetornoEscritorio === 'RECEBIDO';
      return true;
    });
  }, [remessas, searchTerm, statusFilter]);

  const formatDateBR = (d) => {
    if (!d) return '-';
    const parts = d.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
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
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Controle de NFs</h1>
              <p className="text-xs text-slate-500">Selecione o seu perfil para entrar</p>
            </div>
          </div>

          <form onSubmit={handleProfileLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Utilizador / Perfil
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
              title="Ecrã Inteiro"
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 shrink-0"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-slate-800 truncate">Controle NFs</span>
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
                  title="Gerir Utilizadores"
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
              title="Trocar Utilizador / Sair"
