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

// Comprime a imagem antes de enviar à IA para leitura rápida
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
  // LEITURA DE NOTA FISCAL ATUALIZADA PARA MODELO GEMINI 3.8 FLASH (v2.1)
  // ==========================================================================
  const processDataUrlWithGemini = async (rawDataUrl, mimeType) => {
    setIsScanning(true);
    setLastAiError('');
    setScanMessage('Buscando modelo ativo e lendo Nota Fiscal...');

    try {
      const optimizedUrl = await compressImageDataUrl(rawDataUrl);
      const base64Data = optimizedUrl.split(',')[1];
      const finalMime = optimizedUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : mimeType;

      const savedKey = (neuralMemory.customGeminiKey || '').trim();
      const candidateKeys = [];
      if (savedKey) candidateKeys.push(savedKey);
      if (!candidateKeys.includes(firebaseConfig.apiKey)) candidateKeys.push(firebaseConfig.apiKey);

      const prompt = `Extraia os dados desta Nota Fiscal brasileira (DANFE / NF-e) e retorne APENAS um JSON válido (sem blocos markdown) com estas chaves exatas:
{
  "numeroNF": "string",
  "serieNF": "string",
  "fornecedor": "string",
  "cnpjFornecedor": "string",
  "dataEmissaoNF": "YYYY-MM-DD",
  "valorTotal": "numero com ponto ex 1450.50",
  "resumoMercadoria": "resumo dos itens",
  "chaveAcesso": "44 digitos"
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
              .filter(name => name.includes('gemini') && !name.includes('embedding') && !name.includes('aqa'));

            available.sort((a, b) => {
              const score = (n) => (n.includes('3.8-flash') ? 5 : n.includes('2.5-flash') ? 4 : n.includes('2.0-flash') ? 3 : n.includes('flash') ? 2 : 1);
              return score(b) - score(a);
            });

            if (available.length > 0) {
              modelsToTry = available.slice(0, 4);
            }
          } else {
            const errList = await listRes.json().catch(() => ({}));
            errorsLog.push(`[ListModels]: ${errList?.error?.message || listRes.status}`);
          }
        } catch (e) {
          errorsLog.push(`[Rede ListModels]: ${e.message}`);
        }

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
              errorsLog.push(`[${modelName}]: ${msg}`);
              continue;
            }

            let rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (!rawText) {
              errorsLog.push(`[${modelName}]: Resposta vazia`);
              continue;
            }

            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : rawText;
            parsedData = JSON.parse(cleanJson);
            break outerLoop;
          } catch (innerErr) {
            errorsLog.push(`[${modelName}]: ${innerErr.message}`);
          }
        }
      }

      if (!parsedData) {
        throw new Error(errorsLog.slice(0, 2).join(' | ') || 'API Gemini não respondeu');
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
        lancadoPor: loggedUser?.name || 'Utilizador',
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
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Controle de NFs v2.1</h1>
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
                <span className="font-bold text-sm text-slate-800 truncate">Controle NFs <span className="text-[10px] text-emerald-600 font-mono">v2.1</span></span>
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
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 pt-3 space-y-3">
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

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar Nº da NF, fornecedor, mercadoria ou motorista..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
            Carregando controle de Notas Fiscais...
          </div>
        ) : filteredRemessas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Nenhuma Nota Fiscal registada</p>
            <p className="text-xs text-slate-500">Clique em "+ Nova NF" no topo para fotografar ou anexar a primeira nota.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {filteredRemessas.map(item => (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-slate-900">NF {item.numeroNF}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                          item.foiComNota === 'SIM' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {item.foiComNota === 'SIM' ? 'Com NF' : 'Sem NF'}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-700 truncate max-w-[230px]">{item.fornecedor}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-800">
                        {Number(item.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                      <p className="text-[10px] text-slate-400">Envio: {formatDateBR(item.dataEnvioFazenda)}</p>
                    </div>
                  </div>

                  {item.resumoMercadoria && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg line-clamp-2">
                      {item.resumoMercadoria}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Setor: <strong className="text-slate-700">{item.setorDestino}</strong></span>
                    <span>Portador: <strong className="text-slate-700">{item.portadorMotorista || '-'}</strong></span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                    {item.statusAlmoxarifado === 'RECEBIDO' ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 text-center">
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
                        onClick={() => {
                          setAlmoxConfirmData({
                            dataRecebimentoAlmox: todayStr,
                            recebidoPorAlmox: loggedUser.name,
                            observacoesAlmox: item.observacoes || ''
                          });
                          setAlmoxModalItem(item);
                        }}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${
                          currentPermissions.canConfirmAlmox
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Warehouse className="w-3.5 h-3.5" /> Confirmar Almox.
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
                </div>
              ))}
            </div>

            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-3 px-3">NF / Emissão</th>
                    <th className="py-3 px-3">Fornecedor / Mercadoria</th>
                    <th className="py-3 px-3">Envio / Destino</th>
                    <th className="py-3 px-3 text-center">Foi c/ NF?</th>
                    <th className="py-3 px-3">1. Recebimento Almoxarifado</th>
                    <th className="py-3 px-3">2. Retorno Escritório</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredRemessas.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3 align-top">
                        <div className="font-bold text-slate-900">NF {item.numeroNF}</div>
                        <div className="text-slate-500">{formatDateBR(item.dataEmissaoNF)}</div>
                        <div className="font-semibold text-emerald-700 mt-0.5">
                          {Number(item.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top max-w-xs">
                        <div className="font-semibold text-slate-800">{item.fornecedor}</div>
                        <div className="text-slate-500 line-clamp-2">{item.resumoMercadoria || '-'}</div>
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="font-medium text-slate-800">{item.setorDestino}</div>
                        <div className="text-slate-500">Envio: {formatDateBR(item.dataEnvioFazenda)}</div>
                        <div className="text-slate-500">Portador: {item.portadorMotorista || '-'}</div>
                      </td>
                      <td className="py-3 px-3 align-top text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          item.foiComNota === 'SIM' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {item.foiComNota}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-top">
                        {item.statusAlmoxarifado === 'RECEBIDO' ? (
                          <div className="text-emerald-700">
                            <div className="font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Recebido
                            </div>
                            <div className="text-[11px]">Data: {formatDateBR(item.dataRecebimentoAlmox)}</div>
                            <div className="text-[11px]">Por: {item.recebidoPorAlmox}</div>
                          </div>
                        ) : (
                          <button
                            disabled={!currentPermissions.canConfirmAlmox}
                            onClick={() => {
                              setAlmoxConfirmData({
                                dataRecebimentoAlmox: todayStr,
                                recebidoPorAlmox: loggedUser.name,
                                observacoesAlmox: item.observacoes || ''
                              });
                              setAlmoxModalItem(item);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                              currentPermissions.canConfirmAlmox
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <Warehouse className="w-3.5 h-3.5" /> Confirmar Almox.
                          </button>
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
                            onClick={() => {
                              setFormData({ ...item });
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

      {isFormOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 flex items-start justify-center p-2 pt-3 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 shadow-xl mb-20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-800">
                {editingId ? 'Editar Registo de NF' : 'Novo Despacho de Mercadoria (v2.1)'}
              </h2>
              <button onClick={resetForm} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-3 bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openLiveCamera}
                  disabled={isScanning}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm"
                >
                  <Camera className="w-4 h-4" /> Tirar Foto
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={isScanning}
                  className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-2"
                >
                  <ImageIcon className="w-4 h-4" /> Galeria / PDF
                </button>
              </div>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              {isScanning && (
                <div className="mt-2 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-800">
                  <RefreshCw className="w-4 h-4 animate-spin" /> {scanMessage}
                </div>
              )}
              {lastAiError && (
                <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                  <strong>Diagnóstico v2.1:</strong> {lastAiError}
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
                  <label className="font-semibold text-slate-600">Resumo da Mercadoria</label>
                  <input
                    type="text"
                    value={formData.resumoMercadoria}
                    onChange={(e) => setFormData({ ...formData, resumoMercadoria: e.target.value })}
                    className="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
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

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-start justify-center p-2 pt-3 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-3 text-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-400">
                <Camera className="w-4 h-4" /> Posição Vertical (Nota Fiscal)
              </span>
              <button onClick={closeLiveCamera} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative w-full aspect-[3/4] bg-black rounded-xl overflow-hidden border-2 border-emerald-500/60">
              <video
                ref={setVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-3 border-2 border-dashed border-white/60 rounded-lg pointer-events-none flex flex-col justify-between p-2 text-center">
                <span className="bg-black/60 text-[10px] text-emerald-300 px-2 py-0.5 rounded mx-auto">
                  Topo da Nota Fiscal (Telemóvel em pé)
                </span>
                <span className="bg-black/60 text-[10px] text-white/80 px-2 py-0.5 rounded mx-auto">
                  Base da Nota Fiscal
                </span>
              </div>
            </div>

            {cameraError && (
              <p className="text-xs text-amber-300 text-center bg-amber-950/60 p-2 rounded-lg">{cameraError}</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={capturePhotoFromVideo}
                disabled={!cameraReady}
                className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <Camera className="w-4 h-4" /> Capturar Foto
              </button>
              <button
                type="button"
                onClick={() => {
                  closeLiveCamera();
                  galleryInputRef.current?.click();
                }}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 border border-slate-600"
              >
                <ImageIcon className="w-4 h-4" /> Galeria
              </button>
            </div>
          </div>
        </div>
      )}

      {almoxModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
                <Warehouse className="w-4 h-4" /> Confirmar Recebimento no Almoxarifado
              </h3>
              <button onClick={() => setAlmoxModalItem(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-600">
              NF <strong>{almoxModalItem.numeroNF}</strong> • {almoxModalItem.fornecedor}
            </p>
            <form onSubmit={handleConfirmAlmox} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Data do Recebimento no Almoxarifado *</label>
                <input
                  type="date"
                  required
                  value={almoxConfirmData.dataRecebimentoAlmox}
                  onChange={(e) => setAlmoxConfirmData({ ...almoxConfirmData, dataRecebimentoAlmox: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Recebido por (Almoxarife) *</label>
                <input
                  type="text"
                  required
                  value={almoxConfirmData.recebidoPorAlmox}
                  onChange={(e) => setAlmoxConfirmData({ ...almoxConfirmData, recebidoPorAlmox: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAlmoxModalItem(null)} className="px-3 py-2 border rounded-lg">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg">
                  Confirmar Recebimento
                </button>
              </div>
            </form>
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
                <Users className="w-4 h-4 text-emerald-600" /> Cadastro de Utilizadores e Senhas
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
              Todos os {remessas.length} registos serão apagados permanentemente.
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
