'use client';

import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Activity,
  Moon,
  Sun,
  MapPin,
  Phone,
  CalendarPlus,
  Heart,
  CalendarCheck,
  Smile,
  BadgeDollarSign,
  Clock,
  CalendarX,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  UserPlus,
  UserX,
  X,
  CreditCard,
  Mail,
  Save,
  Skull,
  Droplet,
  FolderOpen,
  Edit2,
  Edit3,
  Trash2,
  User,
  AlertOctagon,
  ShieldCheck,
  Cloud,
  CloudLightning,
  RefreshCw,
  FileText,
  Download,
  Check,
  UploadCloud
} from 'lucide-react';

import { auth } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import {
  findOrCreateFolder,
  createOrUpdateFile,
  listFilesInFolder,
  downloadFileContent,
  deleteFile
} from '../lib/googleDrive';
import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

const clinicDataRef = doc(db, 'odontoapp', 'clinic-data');

// ==========================================================================
// DADOS MOCKADOS INICIAIS
// ==========================================================================

const mockProcedures = [
  { id: "pr1", name: "Avaliação Inicial", price: 120.00 },
  { id: "pr2", name: "Limpeza Profilaxia", price: 200.00 },
  { id: "pr3", name: "Canal Endodontia", price: 750.00 },
  { id: "pr4", name: "Extração Simples", price: 300.00 },
  { id: "pr5", name: "Ortodontia Manutenção", price: 150.00 }
];

const mockPatients = [
  {
    id: "p1",
    name: "Maria Souza Santos",
    cpf: "123.456.789-00",
    dob: "1988-04-15",
    gender: "Feminino",
    phone: "(11) 99876-5432",
    email: "maria.souza@email.com",
    medicalHistory: {
      allergies: "Alergia a Penicilina e Dipirona",
      hypertension: true,
      diabetes: false,
      meds: "Usa Losartana 50mg diariamente",
      notes: "Paciente relata ansiedade moderada em atendimentos odontológicos."
    },
    clinicalNotes: "31/05/2026: Realizada limpeza e profilaxia. Gengiva apresentava leve sangramento na região posterior esquerda. Recomendado fio dental."
  },
  {
    id: "p2",
    name: "Carlos Henrique Lima",
    cpf: "987.654.321-11",
    dob: "1975-09-22",
    gender: "Masculino",
    phone: "(21) 98765-4321",
    email: "carlos.lima@email.com",
    medicalHistory: {
      allergies: "",
      hypertension: false,
      diabetes: true,
      meds: "Metformina 850mg",
      notes: "Diabético controlado. Verificar glicemia de jejum antes de cirurgias."
    },
    clinicalNotes: "20/05/2026: Extração do dente 38 (siso) realizada com sucesso. Sutura sem intercorrências."
  },
  {
    id: "p3",
    name: "Julia Rodrigues Costa",
    cpf: "456.789.123-22",
    dob: "2002-12-05",
    gender: "Feminino",
    phone: "(31) 97654-3210",
    email: "julia.costa@email.com",
    medicalHistory: {
      allergies: "Alergia a AAS e Ácido Acetilsalicílico",
      hypertension: false,
      diabetes: false,
      meds: "",
      notes: "Usa aparelho ortodôntico autoligável."
    },
    clinicalNotes: "25/05/2026: Manutenção do aparelho realizada. Troca de arco e elásticos."
  }
];

// Helpers para fuso horário de data (declarado fora do componente para manter pureza de render)
const getLocalDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

const today = getLocalDateString();
const tomorrow = getLocalDateString(new Date(Date.now() + 24 * 60 * 60 * 1000));
const yesterday = getLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

const mockAppointments = [
  { id: "a1", patientId: "p1", dentist: "Dr. Carlos Silva", procedureId: "pr1", date: today, time: "09:00", status: "confirmed" },
  { id: "a2", patientId: "p2", dentist: "Dr. Mateus Santos", procedureId: "pr3", date: today, time: "14:00", status: "scheduled" },
  { id: "a3", patientId: "p3", dentist: "Dra. Fabíola Monteiro", procedureId: "pr5", date: tomorrow, time: "10:30", status: "confirmed" },
  { id: "a4", patientId: "p1", dentist: "Dr. Carlos Silva", procedureId: "pr2", date: yesterday, time: "15:00", status: "completed" }
];

const calculateAge = (dobStr: string) => {
  if (!dobStr) return 0;
  const dob = new Date(dobStr);
  const diffMs = Date.now() - dob.getTime();
  const ageDate = new Date(diffMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export default function Page() {
  // ==========================================================================
  // ESTADOS PRINCIPAIS
  // ==========================================================================
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [procedures, setProcedures] = useState<any[]>([]);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [liveDateTime, setLiveDateTime] = useState<Date | null>(null);

  useEffect(() => {
    const handleInit = setTimeout(() => {
      setLiveDateTime(new Date());
    }, 0);
    const timer = setInterval(() => {
      setLiveDateTime(new Date());
    }, 1000);
    return () => {
      clearTimeout(handleInit);
      clearInterval(timer);
    };
  }, []);

  const [selectedDateStr, setSelectedDateStr] = useState<string>(today);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [theme, setTheme] = useState<string>("dark");

  const dentists = [
    "Dra. Fabíola Monteiro",
    "Dr. Carlos Silva",
    "Dr. Mateus Santos"
  ];

  // Filtros Clínicos
  const [patientsSearchInput, setPatientsSearchInput] = useState<string>("");
  const [agendaDentistFilter, setAgendaDentistFilter] = useState<string>("all");

  // Estados dos Modais
  const [isPatientModalActive, setIsPatientModalActive] = useState<boolean>(false);
  const [isAppointmentModalActive, setIsAppointmentModalActive] = useState<boolean>(false);
  const [isProcedureModalActive, setIsProcedureModalActive] = useState<boolean>(false);
  const [isPatientProfileModalActive, setIsPatientProfileModalActive] = useState<boolean>(false);

  // Referências para Edição / Prontuário
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [editingProcedure, setEditingProcedure] = useState<any>(null);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [viewingPatient, setViewingPatient] = useState<any>(null);

  // Estados dos Formulários
  // 1. Paciente
  const [pName, setPName] = useState("");
  const [pCpf, setPCpf] = useState("");
  const [pDob, setPDob] = useState("");
  const [pGender, setPGender] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pAllergies, setPAllergies] = useState("");
  const [pHypertension, setPHypertension] = useState(false);
  const [pDiabetes, setPDiabetes] = useState(false);
  const [pMeds, setPMeds] = useState("");
  const [pAnamneseNotes, setPAnamneseNotes] = useState("");

  // 2. Procedimento
  const [procName, setProcName] = useState("");
  const [procPrice, setProcPrice] = useState("");

  // 3. Consulta
  const [appPatient, setAppPatient] = useState("");
  const [appDentist, setAppDentist] = useState("");
  const [appProcedure, setAppProcedure] = useState("");
  const [appDate, setAppDate] = useState("");
  const [appTime, setAppTime] = useState("");
  const [appStatus, setAppStatus] = useState("scheduled");

  // 4. Notas Clínicas / Evolução
  const [clinicalNotes, setClinicalNotes] = useState("");

  // 5. Custom Dialog / Modal (Alert & Confirmations)
  const [customDialog, setCustomDialog] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: ''
  });

  const triggerAlert = (title: string, message: string) => {
    setCustomDialog({
      isOpen: true,
      type: 'alert',
      title,
      message,
      confirmText: 'OK'
    });
  };

  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
    setCustomDialog({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      onConfirm
    });
  };

  const closeCustomDialog = () => {
    setCustomDialog(prev => ({ ...prev, isOpen: false }));
  };

  // ==========================================================================
  // ESTADOS E FUNÇÕES DO GOOGLE DRIVE INTEGRATION
  // ==========================================================================
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveLoading, setDriveLoading] = useState<boolean>(false);
  const [mainFolderId, setMainFolderId] = useState<string | null>(null);

  const syncDriveStructure = async (token: string) => {
    setDriveLoading(true);
    try {
      const folderId = await findOrCreateFolder(token, "Consultório Dra. Fabíola");
      setMainFolderId(folderId);
      const files = await listFilesInFolder(token, folderId);
      setDriveFiles(files);
    } catch (error: any) {
      console.error("Error syncing drive:", error);
      triggerAlert("Sincronização no Drive", "Não foi possível sincronizar ou criar a pasta padrão 'Consultório Dra. Fabíola' no Google Drive.");
    } finally {
      setDriveLoading(false);
    }
  };

  const refreshDriveFiles = async () => {
    if (!accessToken || !mainFolderId) return;
    setDriveLoading(true);
    try {
      const files = await listFilesInFolder(accessToken, mainFolderId);
      setDriveFiles(files);
    } catch (e: any) {
      triggerAlert("Sincronização", "Falha ao atualizar a lista de arquivos: " + e.message);
    } finally {
      setDriveLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/drive.file');

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setGoogleUser({
          displayName: result.user.displayName,
          email: result.user.email,
          photoURL: result.user.photoURL
        });
        setNeedsAuth(false);
        triggerAlert("Conexão Estabelecida", `A conta ${result.user.email} se conectou ao Google Drive com sucesso.`);
        await syncDriveStructure(credential.accessToken);
      } else {
        triggerAlert("Sem Autenticação", "Não conseguimos obter o token de acesso do Google Drive.");
      }
    } catch (error: any) {
      console.error(error);
      triggerAlert("Conexão Falhou", `Erro ao tentar se conectar ao Google Drive: ${error.message || error}`);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      setGoogleUser(null);
      setNeedsAuth(true);
      setDriveFiles([]);
      setMainFolderId(null);
      triggerAlert("Desconectado", "Sua sessão do Google Drive foi encerrada.");
    } catch (error: any) {
      console.error(error);
    }
  };

  const backupSystemToDrive = async () => {
    if (!accessToken || !mainFolderId) {
      triggerAlert("Ação Requerida", "Conecte sua conta do Google Drive na aba 'Nuvem' primeiro.");
      return;
    }
    setDriveLoading(true);
    try {
      const localProcs = JSON.parse(localStorage.getItem("of_procedures") || "[]");
      const localPats = JSON.parse(localStorage.getItem("of_patients") || "[]");
      const localAppts = JSON.parse(localStorage.getItem("of_appointments") || "[]");

      const backupObj = {
        version: "1.0",
        date: new Date().toISOString(),
        patients: localPats,
        appointments: localAppts,
        procedures: localProcs
      };

      const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
      const timeStr = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-').split(' ')[0];
      const fileName = `Backup_Clinica_${dateStr}_${timeStr}.json`;
      const fileId = await createOrUpdateFile(
        accessToken,
        fileName,
        "application/json",
        JSON.stringify(backupObj, null, 2),
        mainFolderId
      );

      await refreshDriveFiles();
      triggerAlert("Backup Criado com Sucesso", `O arquivo "${fileName}" foi gerado e salvo com total sucesso na sua pasta padrão do Google Drive.`);
    } catch (error: any) {
      console.error(error);
      triggerAlert("Falha no Backup", `Erro: ${error.message || error}`);
    } finally {
      setDriveLoading(false);
    }
  };

  const restoreSystemFromDrive = async (fileId: string, fileName: string) => {
    if (!accessToken) return;
    triggerConfirm(
      "Confirmar Restauração de Dados",
      `Tem certeza absoluta de que deseja restaurar o backup do arquivo "${fileName}"? Isso irá apagar e sobrescrever todos os dados de pacientes, consultas e procedimentos atualmente salvos no navegador.`,
      async () => {
        setDriveLoading(true);
        try {
          const contentStr = await downloadFileContent(accessToken, fileId);
          const backupObj = JSON.parse(contentStr);

          if (!backupObj.patients || !backupObj.appointments || !backupObj.procedures) {
            throw new Error("Arquivo de backup inválido ou incompatível.");
          }

          localStorage.setItem("of_patients", JSON.stringify(backupObj.patients));
          localStorage.setItem("of_appointments", JSON.stringify(backupObj.appointments));
          localStorage.setItem("of_procedures", JSON.stringify(backupObj.procedures));

          setPatients(backupObj.patients);
          setAppointments(backupObj.appointments);
          setProcedures(backupObj.procedures);

          triggerAlert("Restauração Concluída", "Os dados da clínica foram restaurados com sucesso para a versão do backup selecionado.");
        } catch (error: any) {
          console.error(error);
          triggerAlert("Restauração Falhou", `Não foi possível restaurar os dados: ${error.message || error}`);
        } finally {
          setDriveLoading(false);
        }
      }
    );
  };

  const exportPatientCardToDrive = async (pat: any) => {
    if (!accessToken || !mainFolderId) {
      triggerAlert("Google Drive Desconectado", "Conecte sua conta na aba 'Nuvem' para exportar a ficha do paciente diretamente para o Google Drive.");
      return;
    }
    setDriveLoading(true);
    try {
      const patientApps = appointments.filter(a => a.patientId === pat.id);
      
      const mdContent = `
# Prontuário Clínico Integrado - Consultório Dra. Fabíola Dulce Monteiro
-----------------------------------------------------------
**Nome Completo:** ${pat.name}
**CPF:** ${pat.cpf || '-'}
**Data de Nascimento:** ${formatDate(pat.dob)} (Idade: ${calculateAge(pat.dob)} anos)
**Gênero:** ${pat.gender}
**Contato Telefônico:** ${pat.phone}
**E-mail:** ${pat.email}

## Ficha de Anamnese & Histórico Médico do Paciente
* **Alergias:** ${pat.medicalHistory?.allergies || 'Nenhuma registrada'}
* **Hipertensão:** ${pat.medicalHistory?.hypertension ? 'Sim' : 'Não'}
* **Diabetes:** ${pat.medicalHistory?.diabetes ? 'Sim' : 'Não'}
* **Medicação Contínua:** ${pat.medicalHistory?.meds || 'Nenhuma informada'}
* **Notas de Saúde Gerais:** ${pat.medicalHistory?.notes || '-'}

## Notas de Evolução Odontológica
${pat.clinicalNotes || 'Nenhuma evolução registrada.'}

## Histórico de Consultas Ocorridas e Agendadas
${patientApps.length === 0 ? '- Nenhuma consulta programada ou realizada para este paciente.' : patientApps.map((a, idx) => {
  const proc = procedures.find(p => p.id === a.procedureId);
  const statusFormatted = a.status === 'confirmed' ? 'Confirmado' : a.status === 'completed' ? 'Realizado' : a.status === 'canceled' ? 'Cancelado' : 'Agendado';
  return `${idx + 1}. Data: ${formatDate(a.date)} às ${a.time} | Dentista: ${a.dentist} | Procedimento: ${proc?.name || 'Clínica Geral'} | Status: [${statusFormatted}]`;
}).join('\n')}

-----------------------------------------------------------
*Ficha exportada em: ${new Date().toLocaleString('pt-BR')}*
      `.trim();

      const sanitizedName = pat.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
      const fileName = `Prontuario_${sanitizedName}_${Date.now()}.md`;
      
      await createOrUpdateFile(
        accessToken,
        fileName,
        "text/markdown",
        mdContent,
        mainFolderId
      );

      await refreshDriveFiles();
      triggerAlert("Prontuário Exportado", `A ficha clínica de ${pat.name} foi salva no seu Google Drive com o arquivo "${fileName}"!`);
    } catch (e: any) {
      console.error(e);
      triggerAlert("Erro ao Exportar", "Erro durante a exportação para o Drive: " + e.message);
    } finally {
      setDriveLoading(false);
    }
  };

  const handleDeleteDriveFile = async (fileId: string, fileName: string) => {
    if (!accessToken) return;
    triggerConfirm(
      "Remover Arquivo do Drive",
      `Deseja realmente apagar o arquivo "${fileName}" da sua pasta do Google Drive? Esta ação é irreversível na nuvem.`,
      async () => {
        setDriveLoading(true);
        try {
          await deleteFile(accessToken, fileId);
          await refreshDriveFiles();
          triggerAlert("Excluído com Sucesso", `O arquivo "${fileName}" foi removido do Google Drive.`);
        } catch (error: any) {
          console.error(error);
          triggerAlert("Erro de Exclusão", `Falha ao remover arquivo: ${error.message || error}`);
        } finally {
          setDriveLoading(false);
        }
      }
    );
  };

  const [dragActive, setDragActive] = useState<boolean>(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await uploadUserFileToDrive(file);
    }
  };

  const handleManualFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await uploadUserFileToDrive(file);
    }
  };

  const uploadUserFileToDrive = async (file: File) => {
    if (!accessToken || !mainFolderId) {
      triggerAlert("Ação Bloqueada", "É necessário conectar no Google Drive antes de subir arquivos.");
      return;
    }
    setDriveLoading(true);
    try {
      const fileReader = new FileReader();
      fileReader.onload = async () => {
        try {
          const arrayBuffer = fileReader.result as ArrayBuffer;
          const metaUrl = 'https://www.googleapis.com/drive/v3/files';
          const metaRes = await fetch(metaUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: file.name,
              parents: [mainFolderId],
              mimeType: file.type || 'application/octet-stream'
            }),
          });

          if (!metaRes.ok) {
            throw new Error("Erro ao criar metadados para o arquivo.");
          }

          const fileMeta = await metaRes.json();

          const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileMeta.id}?uploadType=media`;
          const uploadRes = await fetch(uploadUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: arrayBuffer,
          });

          if (!uploadRes.ok) {
            throw new Error("Falha ao transferir os dados do arquivo para o Google Drive.");
          }

          await refreshDriveFiles();
          triggerAlert("Arquivo Enviado", `O arquivo "${file.name}" foi enviado com sucesso para o seu Google Drive!`);
        } catch (innerError: any) {
          triggerAlert("Transmissão Falhou", innerError.message || "Ocorreu uma falha ao enviar.");
        } finally {
          setDriveLoading(false);
        }
      };
      
      fileReader.readAsArrayBuffer(file);
    } catch (err: any) {
      setDriveLoading(false);
      triggerAlert("Upload Falhou", `Erro ao ler arquivo local: ${err.message}`);
    }
  };

  // ==========================================================================
  // INICIALIZAÇÃO DE DADOS
  // ==========================================================================
  useEffect(() => {
    if (typeof window === "undefined") return;

    const localData = {
      procedures: JSON.parse(localStorage.getItem("of_procedures") || JSON.stringify(mockProcedures)),
      patients: JSON.parse(localStorage.getItem("of_patients") || JSON.stringify(mockPatients)),
      appointments: JSON.parse(localStorage.getItem("of_appointments") || JSON.stringify(mockAppointments))
    };
    const storedTheme = localStorage.getItem("of_theme");
    document.body.classList.toggle("light-mode", storedTheme === "light");
    Promise.resolve().then(() => {
      setProcedures(localData.procedures);
      setPatients(localData.patients);
      setAppointments(localData.appointments);
      setTheme(storedTheme === "light" ? "light" : "dark");
    });

    let migrationStarted = false;
    const unsubscribeFromCloud = onSnapshot(
      clinicDataRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          if (!migrationStarted) {
            migrationStarted = true;
            void setDoc(clinicDataRef, localData).catch((error) => {
              console.warn("Não foi possível migrar o cache local para o Firestore.", error);
            });
          }
          return;
        }

        const cloudData = snapshot.data();
        const procedures = Array.isArray(cloudData.procedures) ? cloudData.procedures : [];
        const patients = Array.isArray(cloudData.patients) ? cloudData.patients : [];
        const appointments = Array.isArray(cloudData.appointments) ? cloudData.appointments : [];

        localStorage.setItem("of_procedures", JSON.stringify(procedures));
        localStorage.setItem("of_patients", JSON.stringify(patients));
        localStorage.setItem("of_appointments", JSON.stringify(appointments));
        setProcedures(procedures);
        setPatients(patients);
        setAppointments(appointments);
        setCloudSyncEnabled(true);
      },
      (error) => {
        console.warn("A sincronização em tempo real está indisponível; o cache local continuará disponível.", error);
        setCloudSyncEnabled(false);
      }
    );

    return () => {
      unsubscribeFromCloud?.();
    };
  }, []);

  const saveData = async (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));

    const fieldByStorageKey: Record<string, "patients" | "appointments" | "procedures"> = {
      of_patients: "patients",
      of_appointments: "appointments",
      of_procedures: "procedures"
    };
    const field = fieldByStorageKey[key];
    if (!field) return;

    try {
      await setDoc(clinicDataRef, { [field]: data }, { merge: true });
      setCloudSyncEnabled(true);
    } catch (error) {
      console.warn(`Firestore indisponível para salvar ${field}; o cache local foi preservado.`, error);
    }
  };

  // ==========================================================================
  // MANIPULAÇÕES DE TEMA / INTERFACE
  // ==========================================================================
  const handleToggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("of_theme", nextTheme);
    if (nextTheme === "light") {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
  };

  // Títulos e subtítulos dinâmicos
  const pageDetails: Record<string, { title: string, subtitle: string }> = {
    dashboard: { title: "Painel Clínico", subtitle: "Acompanhe as consultas e pacientes de hoje." },
    agenda: { title: "Agenda de Consultas", subtitle: "Gerencie horários e evite conflitos de marcações." },
    patients: { title: "Fichas de Pacientes", subtitle: "Visualize prontuários, contatos e histórico clínico." },
    procedures: { title: "Tabela de Procedimentos", subtitle: "Gerencie tratamentos e preços do consultório." },
    drive: { title: "Nuvem & Backup (Google Drive)", subtitle: "Gerencie backups na nuvem, exporte prontuários e organize os arquivos do consultório." }
  };

  // KPIs
  const totalPatientsCount = patients.length;
  const todayAppointments = appointments.filter(a => a.date === today && a.status !== "canceled");
  const activeTreatmentsCount = appointments.filter(a => a.dentist === "Dra. Fabíola Monteiro" && a.status !== "canceled").length;

  const todayRevenue = todayAppointments
    .filter(a => a.status === "completed" || a.status === "confirmed")
    .reduce((sum, curr) => {
      const proc = procedures.find(p => p.id === curr.procedureId);
      return sum + (proc ? proc.price : 0);
    }, 0);

  // Alertas Médicos de Hoje
  const todayPatientIds = appointments
    .filter(a => a.date === today && a.status !== "canceled")
    .map(a => a.patientId);

  const alertPatients = patients.filter(p => {
    return todayPatientIds.includes(p.id) &&
      (p.medicalHistory.allergies || p.medicalHistory.hypertension || p.medicalHistory.diabetes);
  });

  // Consultas da Agenda Rápida do Dia
  const sortedTodayApps = appointments
    .filter(a => a.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  // ==========================================================================
  // DETALHES DE CALENDÁRIO MENSAL
  // ==========================================================================
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push({ type: "empty" });
  }

  for (let day = 1; day <= totalDays; day++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayApps = appointments.filter(a => a.date === dayStr);
    calendarDays.push({
      type: "day",
      dayNumber: day,
      dayStr: dayStr,
      appointments: dayApps
    });
  }

  const handlePrevMonth = () => {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(currentDate.getMonth() - 1);
    setCurrentDate(nextDate);
  };

  const handleNextMonth = () => {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(currentDate.getMonth() + 1);
    setCurrentDate(nextDate);
  };

  // Consultas do Dia Selecionado na Agenda
  let selectedDayApps = appointments.filter(a => a.date === selectedDateStr);
  if (agendaDentistFilter !== "all") {
    selectedDayApps = selectedDayApps.filter(a => a.dentist === agendaDentistFilter);
  }
  selectedDayApps.sort((a, b) => a.time.localeCompare(b.time));

  // ==========================================================================
  // CONTROLE DE MODAIS (ABERTURA E FECHAMENTO)
  // ==========================================================================
  const openPatientModal = (patientObj: any = null) => {
    if (patientObj) {
      setEditingPatient(patientObj);
      setPName(patientObj.name);
      setPCpf(patientObj.cpf);
      setPDob(patientObj.dob);
      setPGender(patientObj.gender);
      setPPhone(patientObj.phone);
      setPEmail(patientObj.email);
      setPAllergies(patientObj.medicalHistory.allergies);
      setPHypertension(patientObj.medicalHistory.hypertension);
      setPDiabetes(patientObj.medicalHistory.diabetes);
      setPMeds(patientObj.medicalHistory.meds);
      setPAnamneseNotes(patientObj.medicalHistory.notes);
    } else {
      setEditingPatient(null);
      setPName("");
      setPCpf("");
      setPDob("");
      setPGender("");
      setPPhone("");
      setPEmail("");
      setPAllergies("");
      setPHypertension(false);
      setPDiabetes(false);
      setPMeds("");
      setPAnamneseNotes("");
    }
    setIsPatientModalActive(true);
  };

  const openProcedureModal = (procObj: any = null) => {
    if (procObj) {
      setEditingProcedure(procObj);
      setProcName(procObj.name);
      setProcPrice(procObj.price.toString());
    } else {
      setEditingProcedure(null);
      setProcName("");
      setProcPrice("");
    }
    setIsProcedureModalActive(true);
  };

  const openAppointmentModal = (dateStr: string | null = null, apptObj: any = null) => {
    if (apptObj) {
      setEditingAppointment(apptObj);
      setAppPatient(apptObj.patientId);
      setAppDentist(apptObj.dentist);
      setAppProcedure(apptObj.procedureId);
      setAppDate(apptObj.date);
      setAppTime(apptObj.time);
      setAppStatus(apptObj.status);
    } else {
      setEditingAppointment(null);
      setAppPatient("");
      setAppDentist("");
      setAppProcedure("");
      setAppDate(dateStr || today);
      setAppTime("");
      setAppStatus("scheduled");
    }
    setIsAppointmentModalActive(true);
  };

  const openPatientProfileModal = (patientObj: any) => {
    setViewingPatient(patientObj);
    setClinicalNotes(patientObj.clinicalNotes || "");
    setIsPatientProfileModalActive(true);
  };

  // ==========================================================================
  // SUBMISSÃO DE FORMULÁRIOS E EVOLUÇÕES CLINICAS
  // ==========================================================================
  const checkScheduleConflict = (id: string, dentist: string, date: string, time: string) => {
    return appointments.some(app => {
      if (app.id === id) return false;
      if (app.status === "canceled") return false;
      return app.dentist === dentist && app.date === date && app.time === time;
    });
  };

  const handleSubmitPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim() || !pCpf.trim() || !pDob || !pGender || !pPhone.trim() || !pEmail.trim()) {
      triggerAlert("Campos Obrigatórios", "Por favor, preencha todos os campos obrigatórios identificados.");
      return;
    }

    const medicalHistory = {
      allergies: pAllergies.trim(),
      hypertension: pHypertension,
      diabetes: pDiabetes,
      meds: pMeds.trim(),
      notes: pAnamneseNotes.trim()
    };

    let updatedList;
    if (editingPatient) {
      updatedList = patients.map(p => {
        if (p.id === editingPatient.id) {
          return { ...p, name: pName.trim(), cpf: pCpf.trim(), dob: pDob, gender: pGender, phone: pPhone.trim(), email: pEmail.trim(), medicalHistory };
        }
        return p;
      });
    } else {
      const newPatient = {
        id: "p_" + Date.now(),
        name: pName.trim(),
        cpf: pCpf.trim(),
        dob: pDob,
        gender: pGender,
        phone: pPhone.trim(),
        email: pEmail.trim(),
        medicalHistory,
        clinicalNotes: ""
      };
      updatedList = [...patients, newPatient];
    }

    setPatients(updatedList);
    saveData("of_patients", updatedList);
    setIsPatientModalActive(false);
  };

  const handleSubmitProcedure = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(procPrice);
    if (!procName.trim() || isNaN(parsedPrice)) {
      triggerAlert("Campos Incompletos", "Por favor, preencha corretamento o nome e o valor do procedimento.");
      return;
    }

    let updatedList;
    if (editingProcedure) {
      updatedList = procedures.map(p => {
        if (p.id === editingProcedure.id) {
          return { ...p, name: procName.trim(), price: parsedPrice };
        }
        return p;
      });
    } else {
      const newProc = {
        id: "pr_" + Date.now(),
        name: procName.trim(),
        price: parsedPrice
      };
      updatedList = [...procedures, newProc];
    }

    setProcedures(updatedList);
    saveData("of_procedures", updatedList);
    setIsProcedureModalActive(false);
  };

  const handleSubmitAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appPatient || !appDentist || !appProcedure || !appDate || !appTime || !appStatus) {
      triggerAlert("Campos Incompletos", "Por favor, preencha todos os campos do agendamento.");
      return;
    }

    const apptId = editingAppointment ? editingAppointment.id : "";
    if (checkScheduleConflict(apptId, appDentist, appDate, appTime)) {
      triggerAlert(
        "Conflito de Horário",
        `O(A) ${appDentist} já tem uma consulta agendada para o dia ${formatDate(appDate)} às ${appTime}. Por favor, escolha outro horário.`
      );
      return;
    }

    let updatedList;
    if (editingAppointment) {
      updatedList = appointments.map(a => {
        if (a.id === editingAppointment.id) {
          return { ...a, patientId: appPatient, dentist: appDentist, procedureId: appProcedure, date: appDate, time: appTime, status: appStatus };
        }
        return a;
      });
    } else {
      const newApp = {
        id: "a_" + Date.now(),
        patientId: appPatient,
        dentist: appDentist,
        procedureId: appProcedure,
        date: appDate,
        time: appTime,
        status: appStatus
      };
      updatedList = [...appointments, newApp];
      setSelectedDateStr(appDate);
      setCurrentDate(new Date(appDate + "T00:00:00"));
    }

    setAppointments(updatedList);
    saveData("of_appointments", updatedList);
    setIsAppointmentModalActive(false);
  };

  const handleSaveClinicalNotes = () => {
    if (!viewingPatient) return;
    const updatedList = patients.map(p => {
      if (p.id === viewingPatient.id) {
        return { ...p, clinicalNotes: clinicalNotes };
      }
      return p;
    });
    setPatients(updatedList);
    saveData("of_patients", updatedList);
    setViewingPatient({ ...viewingPatient, clinicalNotes: clinicalNotes });
    triggerAlert("Sucesso", "Notas de evolução clínica salvas com sucesso!");
  };

  // ==========================================================================
  // REMOÇÃO DE DADOS E VALIDAÇÕES
  // ==========================================================================
  const handleDeletePatient = (id: string) => {
    const hasApps = appointments.some(a => a.patientId === id && a.status !== "canceled");
    if (hasApps) {
      triggerAlert(
        "Ação Bloqueada",
        "Não é possível remover este paciente pois ele possui consultas ativas marcadas na agenda!"
      );
      return;
    }

    triggerConfirm(
      "Confirmar Exclusão",
      "Aviso: Isso irá apagar permanentemente a ficha deste paciente e todo o seu histórico médico! Confirmar exclusão?",
      () => {
        const updatedList = patients.filter(p => p.id !== id);
        setPatients(updatedList);
        saveData("of_patients", updatedList);
      }
    );
  };

  const handleDeleteAppointment = (id: string) => {
    triggerConfirm(
      "Confirmar Cancelamento",
      "Deseja realmente cancelar/excluir esta consulta da agenda?",
      () => {
        const updatedList = appointments.filter(a => a.id !== id);
        setAppointments(updatedList);
        saveData("of_appointments", updatedList);
      }
    );
  };

  const handleDeleteProcedure = (id: string) => {
    const hasApps = appointments.some(a => a.procedureId === id);
    if (hasApps) {
      triggerAlert(
        "Ação Bloqueada",
        "Não é possível deletar este procedimento pois ele já está vinculado a consultas marcadas no sistema!"
      );
      return;
    }

    triggerConfirm(
      "Confirmar Exclusão",
      "Tem certeza que deseja remover este procedimento da tabela padrão de preços?",
      () => {
        const updatedList = procedures.filter(p => p.id !== id);
        setProcedures(updatedList);
        saveData("of_procedures", updatedList);
      }
    );
  };

  // Filtragem de Pacientes
  const filteredPatients = patients.filter(p => {
    const query = patientsSearchInput.toLowerCase().trim();
    return p.name.toLowerCase().includes(query) ||
      p.cpf.includes(query) ||
      p.phone.includes(query) ||
      p.email.toLowerCase().includes(query);
  });

  // Consultas no Perfil do Prontuário do Paciente Ativo
  const patientAppointmentsInProfile = viewingPatient
    ? appointments
      .filter(a => a.patientId === viewingPatient.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    : [];

  const statusLabels: Record<string, string> = { scheduled: "Agendado", confirmed: "Confirmado", completed: "Concluído", canceled: "Cancelado" };
  const statusBadges: Record<string, string> = { scheduled: "badge-blue", confirmed: "badge-orange", completed: "badge-green", canceled: "badge-red" };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-card-container">
          <img src="/logo_cartao.jpg" alt="Consultório Odontológico Dra. Fabíola Dulce Monteiro" className="brand-card-img" referrerPolicy="no-referrer" />
        </div>

        <nav className="nav-menu">
          <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab("dashboard")}>
            <LayoutDashboard />
            <span>Painel Geral</span>
          </button>
          <button className={`nav-item ${activeTab === 'agenda' ? 'active' : ''}`} onClick={() => setActiveTab("agenda")}>
            <Calendar />
            <span>Agenda & Consultas</span>
          </button>
          <button className={`nav-item ${activeTab === 'patients' ? 'active' : ''}`} onClick={() => setActiveTab("patients")}>
            <Users />
            <span>Pacientes</span>
          </button>
          <button className={`nav-item ${activeTab === 'procedures' ? 'active' : ''}`} onClick={() => setActiveTab("procedures")}>
            <Activity />
            <span>Procedimentos</span>
          </button>
          <button className={`nav-item ${activeTab === 'drive' ? 'active' : ''}`} onClick={() => setActiveTab("drive")}>
            <Cloud />
            <span>Nuvem & Backup</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button id="theme-toggle" className="theme-btn" title="Alternar tema" onClick={handleToggleTheme}>
            {theme === "dark" ? <Moon className="dark-icon" /> : <Sun className="light-icon" />}
            <span>{theme === "dark" ? "Modo Escuro" : "Modo Claro"}</span>
          </button>
          <div className="sidebar-clinic-info text-muted">
            <p><MapPin /> Av. Cristiano Machado, 1682, Sl 706</p>
            <p><Phone /> (31) 3318-6282</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <div className="header-brand-wrap">
            <div className="header-logo">
              <svg viewBox="0 0 100 100" className="logo-svg-header">
                <path d="M35,22 C45,15 65,15 75,20 C82,25 80,45 75,52 C65,58 45,55 35,50 C28,45 28,25 35,22 Z" fill="var(--color-secondary)" opacity="0.9" />
                <path d="M30,12 C40,9 65,7 80,18 C85,22 84,32 80,45 C73,62 72,80 70,92 C69,96 64,98 62,94 C57,84 53,70 50,60 C47,70 43,84 38,94 C36,98 31,96 30,92 C28,80 23,60 14,42 C8,30 8,16 20,12 C24,11 27,11 30,12"
                  fill="none" stroke="var(--color-primary)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="header-info">
              <h1 id="page-title">{pageDetails[activeTab]?.title}</h1>
              <p id="page-subtitle" className="text-muted">{pageDetails[activeTab]?.subtitle}</p>
            </div>
          </div>
          <div className="header-actions">
            <button id="quick-patient-btn" className="btn btn-primary" onClick={() => openPatientModal()}>
              <UserPlus />
              <span>Cadastrar Paciente</span>
            </button>
            <button id="quick-appointment-btn" className="btn btn-primary" onClick={() => openAppointmentModal()}>
              <CalendarPlus />
              <span>Agendar Consulta</span>
            </button>
          </div>
        </header>

        {/* Container das Abas */}
        <div className="tab-content-wrapper">

          {/* 1. ABA DASHBOARD */}
          <section id="dashboard-tab" className={`tab-panel ${activeTab === 'dashboard' ? 'active' : ''}`}>
            {/* KPI Cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon bg-teal-translucent">
                  <Heart className="text-teal" />
                </div>
                <div className="stat-details">
                  <span className="stat-label">Total de Pacientes</span>
                  <h3 id="stat-total-patients" className="stat-value">{totalPatientsCount}</h3>
                </div>
              </div>
              <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div className="stat-icon bg-blue-translucent">
                    <CalendarCheck className="text-blue" />
                  </div>
                  <div className="stat-details" style={{ flex: 1 }}>
                    <span className="stat-label">Consultas Hoje</span>
                    <h3 id="stat-today-appointments" className="stat-value" style={{ margin: 0 }}>
                      {todayAppointments.length}
                    </h3>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-color)',
                  backgroundColor: 'var(--active-bg, rgba(59, 130, 246, 0.08))',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '8px',
                  padding: '4px 10px',
                  marginTop: '0.25rem',
                  justifyContent: 'center',
                  width: '100%',
                }}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  <span>{liveDateTime ? `${liveDateTime.toLocaleDateString('pt-BR')} • ${liveDateTime.toLocaleTimeString('pt-BR')}` : '--/--/---- • --:--:--'}</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon bg-orange-translucent">
                  <Smile className="text-orange" />
                </div>
                <div className="stat-details">
                  <span className="stat-label">Ortodontia/Ativos</span>
                  <h3 id="stat-active-treatments" className="stat-value">{activeTreatmentsCount}</h3>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon bg-green-translucent">
                  <BadgeDollarSign className="text-green" />
                </div>
                <div className="stat-details">
                  <span className="stat-label">Faturamento Hoje</span>
                  <h3 id="stat-today-revenue" className="stat-value">R$ {todayRevenue.toFixed(2)}</h3>
                </div>
              </div>
            </div>

            {/* Agenda do Dia e Alertas */}
            <div className="dashboard-layout-grid">
              {/* Agenda Rápida do Dia */}
              <div className="card day-agenda-card">
                <h2 className="card-title"><Clock /> Próximas Consultas de Hoje</h2>
                <div id="today-appointments-list" className="agenda-list">
                  {sortedTodayApps.length === 0 ? (
                    <div className="empty-state" style={{ padding: "2rem 0" }}>
                      <CalendarX className="empty-icon" style={{ width: "40px", height: "40px" }} />
                      <p style={{ fontSize: "0.9rem" }}>Nenhuma consulta agendada para hoje.</p>
                    </div>
                  ) : (
                    sortedTodayApps.map(app => {
                      const patient = patients.find(p => p.id === app.patientId);
                      const proc = procedures.find(p => p.id === app.procedureId);
                      return (
                        <div key={app.id} className="agenda-item">
                          <div className="agenda-item-left">
                            <div className="agenda-time">{app.time}</div>
                            <div className="agenda-info">
                              <h4>{patient ? patient.name : "Paciente Desconhecido"}</h4>
                              <p>{app.dentist} • {proc ? proc.name : "Procedimento Geral"}</p>
                            </div>
                          </div>
                          <div>
                            <span className={`badge ${statusBadges[app.status]}`}>{statusLabels[app.status]}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Card Alertas Médicos / Alergias Críticas */}
              <div className="card medical-alerts-card">
                <h2 className="card-title"><AlertTriangle className="text-orange" /> Alertas Clínicos Críticos</h2>
                <div id="medical-alerts-list" className="alerts-list">
                  {alertPatients.length === 0 ? (
                    <div className="empty-state" style={{ padding: "2.5rem 0" }}>
                      <ShieldCheck className="empty-icon text-green" style={{ width: "40px", height: "40px" }} />
                      <p style={{ fontSize: "0.9rem" }}>Tudo seguro! Nenhum paciente de hoje apresenta restrições graves.</p>
                    </div>
                  ) : (
                    alertPatients.map(p => {
                      let alertsText = [];
                      if (p.medicalHistory.allergies) alertsText.push(`⚠️ Alergias: ${p.medicalHistory.allergies}`);
                      if (p.medicalHistory.hypertension) alertsText.push("❤️ Paciente Hipertenso");
                      if (p.medicalHistory.diabetes) alertsText.push("🩸 Paciente Diabético");
                      return (
                        <div key={p.id} className="alert-item">
                          <AlertOctagon className="text-red" />
                          <div className="alert-item-text">
                            <h4>{p.name}</h4>
                            <p>{alertsText.join(" | ")}</p>
                            {p.medicalHistory.meds ? <p style={{ fontStyle: "italic", fontSize: "0.75rem" }}>Medicamentos: {p.medicalHistory.meds}</p> : ""}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 2. ABA AGENDA & CALENDÁRIO */}
          <section id="agenda-tab" className={`tab-panel ${activeTab === 'agenda' ? 'active' : ''}`}>
            <div className="calendar-layout-container">
              {/* Lado Esquerdo: Calendário */}
              <div className="card calendar-card">
                <div className="calendar-header">
                  <h2 className="card-title"><Calendar /> Agenda Mensal</h2>
                  <div className="calendar-nav">
                    <button id="prev-month-btn" className="btn btn-icon" title="Mês Anterior" onClick={handlePrevMonth}>
                      <ChevronLeft />
                    </button>
                    <span id="calendar-month-year" className="month-title">{monthNames[month]} {year}</span>
                    <button id="next-month-btn" className="btn btn-icon" title="Próximo Mês" onClick={handleNextMonth}>
                      <ChevronRight />
                    </button>
                  </div>
                </div>
                <div className="calendar-body">
                  <div className="calendar-weekdays">
                    <div>Dom</div>
                    <div>Seg</div>
                    <div>Ter</div>
                    <div>Qua</div>
                    <div>Qui</div>
                    <div>Sex</div>
                    <div>Sáb</div>
                  </div>
                  <div id="calendar-days" className="calendar-days-grid">
                    {calendarDays.map((day, idx) => {
                      if (day.type === "empty") {
                        return <div key={`empty-${idx}`} className="calendar-day empty-day"></div>;
                      }

                      const isDayToday = day.dayStr === today;
                      const isDaySelected = day.dayStr === selectedDateStr;

                      return (
                        <div key={day.dayStr} className={`calendar-day ${isDayToday ? 'today' : ''} ${isDaySelected ? 'selected' : ''}`} onClick={() => setSelectedDateStr(day.dayStr || "")}>
                          <span className="day-number">{day.dayNumber}</span>
                          <div className="day-indicators">
                            {day.appointments?.map((app: any) => {
                              const statusColors: Record<string, string> = { scheduled: "bg-blue", confirmed: "bg-orange", completed: "bg-green", canceled: "bg-red" };
                              return <span key={app.id} className={`dot ${statusColors[app.status]}`} title={app.dentist}></span>;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="calendar-legend">
                  <div className="legend-item"><span className="dot bg-blue"></span> Agendada</div>
                  <div className="legend-item"><span className="dot bg-green"></span> Concluída</div>
                  <div className="legend-item"><span className="dot bg-orange"></span> Confirmada</div>
                  <div className="legend-item"><span className="dot bg-red"></span> Cancelada</div>
                </div>
              </div>

              {/* Lado Direito: Consultas do Dia Selecionado */}
              <div className="card day-details-card">
                <div className="day-details-header">
                  <h3 id="selected-day-title">Consultas em {formatDate(selectedDateStr)}</h3>
                  <button id="add-appointment-day-btn" className="btn btn-primary btn-sm" onClick={() => openAppointmentModal(selectedDateStr)}>
                    <Plus /> Agendar
                  </button>
                </div>
                <div className="filter-actions-mini">
                  <select id="agenda-dentist-filter" className="form-select select-sm" value={agendaDentistFilter} onChange={(e) => setAgendaDentistFilter(e.target.value)}>
                    <option value="all">Todos os Dentistas</option>
                    {dentists.map(dentist => (
                      <option key={dentist} value={dentist}>{dentist}</option>
                    ))}
                  </select>
                </div>
                <div id="selected-day-appointments-list" className="day-appointments-scroll">
                  {selectedDayApps.length === 0 ? (
                    <div className="empty-state" style={{ padding: "2.5rem 0" }}>
                      <Calendar className="empty-icon" />
                      <p style={{ fontSize: "0.85rem" }}>Nenhuma consulta agendada para este dia.</p>
                    </div>
                  ) : (
                    selectedDayApps.map(app => {
                      const patient = patients.find(p => p.id === app.patientId);
                      const proc = procedures.find(p => p.id === app.procedureId);
                      return (
                        <div key={app.id} className="agenda-item">
                          <div className="agenda-item-left">
                            <div className="agenda-time">{app.time}</div>
                            <div className="agenda-info">
                              <h4><strong>{patient ? patient.name : "Paciente Desconhecido"}</strong></h4>
                              <p>{app.dentist} • {proc ? proc.name : "Procedimento Geral"}</p>
                              <span className={`badge ${statusBadges[app.status]}`} style={{ marginTop: "0.35rem" }}>{statusLabels[app.status]}</span>
                            </div>
                          </div>
                          <div className="action-buttons">
                            <button className="btn btn-icon btn-sm edit-app-btn" title="Editar agendamento" onClick={() => openAppointmentModal(null, app)}><Edit2 /></button>
                            <button className="btn btn-icon btn-sm text-red delete-app-btn" title="Remover agendamento" onClick={() => handleDeleteAppointment(app.id)}><Trash2 /></button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 3. ABA PACIENTES */}
          <section id="patients-tab" className={`tab-panel ${activeTab === 'patients' ? 'active' : ''}`}>
            <div className="action-bar">
              <div className="search-box">
                <Search className="search-icon" />
                <input type="text" id="patients-search-input" placeholder="Buscar pacientes por nome, CPF ou e-mail..." value={patientsSearchInput} onChange={(e) => setPatientsSearchInput(e.target.value)} />
              </div>
            </div>

            <div className="card table-card">
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Paciente</th>
                      <th>CPF</th>
                      <th>Contato</th>
                      <th>Alertas Clínicos</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="patients-table-body">
                    {filteredPatients.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <div id="patients-empty-state" className="empty-state">
                            <UserX className="empty-icon" />
                            <p>Nenhum paciente cadastrado com estes critérios.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredPatients
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(patient => {
                          let alertBadgesList = [];
                          if (patient.medicalHistory.allergies) {
                            alertBadgesList.push(<span key="allergies" className="badge badge-red" title={patient.medicalHistory.allergies}><Skull /> Alergia</span>);
                          }
                          if (patient.medicalHistory.hypertension) {
                            alertBadgesList.push(<span key="hypertension" className="badge badge-orange"><Activity /> Pressão Alta</span>);
                          }
                          if (patient.medicalHistory.diabetes) {
                            alertBadgesList.push(<span key="diabetes" className="badge badge-orange"><Droplet /> Diabetes</span>);
                          }

                          return (
                            <tr key={patient.id}>
                              <td><strong>{patient.name}</strong><br /><small className="text-muted">{patient.gender} • {calculateAge(patient.dob)} anos</small></td>
                              <td><code>{patient.cpf}</code></td>
                              <td>{patient.phone}<br /><small className="text-muted">{patient.email}</small></td>
                              <td>
                                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                                  {alertBadgesList.length > 0 ? alertBadgesList : <span className="text-muted" style={{ fontSize: "0.8rem" }}>Sem restrições</span>}
                                </div>
                              </td>
                              <td className="text-right">
                                <div className="action-buttons">
                                  <button className="btn btn-icon btn-sm view-patient-profile-btn" title="Ficha / Prontuário" onClick={() => openPatientProfileModal(patient)}><FolderOpen /></button>
                                  <button className="btn btn-icon btn-sm edit-patient-btn" title="Editar dados" onClick={() => openPatientModal(patient)}><Edit3 /></button>
                                  <button className="btn btn-icon btn-sm text-red delete-patient-btn" title="Excluir paciente" onClick={() => handleDeletePatient(patient.id)}><Trash2 /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 4. ABA PROCEDIMENTOS */}
          <section id="procedures-tab" className={`tab-panel ${activeTab === 'procedures' ? 'active' : ''}`}>
            <div className="action-bar flex-end">
              <button id="add-procedure-btn" className="btn btn-primary" onClick={() => openProcedureModal()}>
                <Plus /> Adicionar Procedimento
              </button>
            </div>

            <div className="card table-card">
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nome do Procedimento</th>
                      <th>Valor Padrão</th>
                      <th className="text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody id="procedures-table-body">
                    {procedures.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <div id="procedures-empty-state" className="empty-state">
                            <Activity className="empty-icon" />
                            <p>Nenhum procedimento cadastrado.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      procedures
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((proc, index) => (
                          <tr key={proc.id}>
                            <td><code>PR-{String(index + 1).padStart(3, "0")}</code></td>
                            <td><strong>{proc.name}</strong></td>
                            <td><strong>R$ {proc.price.toFixed(2)}</strong></td>
                            <td className="text-right">
                              <div className="action-buttons">
                                <button className="btn btn-icon btn-sm edit-proc-btn" title="Editar" onClick={() => openProcedureModal(proc)}><Edit3 /></button>
                                <button className="btn btn-icon btn-sm text-red delete-proc-btn" title="Remover" onClick={() => handleDeleteProcedure(proc.id)}><Trash2 /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 5. ABA GOOGLE DRIVE & NUVEM */}
          <section id="drive-tab" className={`tab-panel ${activeTab === 'drive' ? 'active' : ''}`}>
            {needsAuth ? (
              <div className="card text-center" style={{ padding: '3.5rem 2rem', maxWidth: '640px', margin: '2rem auto' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '5rem',
                  height: '5rem',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(107, 70, 193, 0.1)',
                  color: 'var(--primary-color)',
                  marginBottom: '1.5rem'
                }}>
                  <Cloud size={48} className="animate-pulse" />
                </div>
                <h3 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-sans)', fontWeight: 600, marginBottom: '0.75rem' }}>
                  Conectar ao Google Drive
                </h3>
                <p className="text-muted" style={{ maxWidth: '480px', margin: '0 auto 1.75rem auto', fontSize: '0.95rem', lineHeight: '1.6' }}>
                  Vincule a sua conta do Gmail para salvar as fichas de evolução de seus pacientes em Markdown, enviar radiografias ou exames externos e fazer backups integrais dos dados clínicos do consultório com total segurança na nuvem.
                </p>
                
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button className="gsi-material-button" onClick={handleGoogleLogin} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)' }}>
                    <div className="gsi-material-button-state"></div>
                    <div className="gsi-material-button-content-wrapper">
                      <div className="gsi-material-button-icon">
                        <svg viewBox="0 0 48 48" style={{ display: 'block' }}>
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                          <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                      </div>
                      <span className="gsi-material-button-contents" style={{ fontWeight: 550 }}>Conectar conta Google</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Conexão de Conta Ativa */}
                <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', marginBottom: '1.5rem', gap: '1rem', background: 'rgba(107, 70, 193, 0.05)', borderColor: 'rgba(107, 70, 193, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {googleUser?.photoURL ? (
                      <img src={googleUser.photoURL} alt={googleUser.displayName} style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%' }} referrerPolicy="no-referrer" />
                    ) : (
                      <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        {googleUser?.displayName?.charAt(0) || "U"}
                      </div>
                    )}
                    <div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{googleUser?.displayName || "Usuário Conectado"}</p>
                      <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>{googleUser?.email}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-secondary btn-sm" onClick={refreshDriveFiles} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <RefreshCw size={14} className={driveLoading ? "animate-spin" : ""} /> Atualizar Drive
                    </button>
                    <button className="btn btn-secondary btn-sm text-red" onClick={handleGoogleLogout}>
                      Desconectar
                    </button>
                  </div>
                </div>

                {/* Grid de Backup & Upload */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                  
                  {/* Card de Backups */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-color)' }}>
                        <CloudLightning size={18} style={{ color: 'var(--primary-color)' }} /> Backups do Banco de Dados
                      </h4>
                      <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: '1.4', marginBottom: '1.25rem' }}>
                        Gere arquivos de restauração criptografados em formato JSON. Salvando um ponto de backup, você pode recuperar fichas de pacientes, tratamentos e consultas mesmo em caso de exclusão acidental ou reinstalação.
                      </p>
                    </div>
                    <button className="btn btn-primary w-full" onClick={backupSystemToDrive} disabled={driveLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <UploadCloud size={16} /> Gravar Backup Geral do Consultório
                    </button>
                  </div>

                  {/* Card de Upload de Arquivos / XRays */}
                  <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-color)' }}>
                      <FileText size={18} style={{ color: 'var(--color-secondary)' }} /> Upload de Arquivos Clínicos
                    </h4>
                    <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: '1.4', marginBottom: '1rem' }}>
                      Adicione radiografias, laudos de exames ortodônticos, fotos de sorrisos anteriores, ou termo de consentimento livre e esclarecido diretamente na nuvem da clínica.
                    </p>

                    {/* Drag and Drop Zone */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      style={{
                        flex: 1,
                        border: dragActive ? '2px dashed var(--primary-color)' : '2px dashed var(--border-color)',
                        borderRadius: '6px',
                        background: dragActive ? 'rgba(107, 70, 193, 0.05)' : 'rgba(0,0,0,0.02)',
                        padding: '1.5rem',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease-in-out'
                      }}
                      onClick={() => document.getElementById('manual-drive-file-input')?.click()}
                    >
                      <UploadCloud size={28} className="text-muted" style={{ marginBottom: '0.5rem' }} />
                      <p style={{ fontSize: '0.85rem', fontWeight: 550, margin: '0 0 0.25rem 0' }}>
                        {dragActive ? "Solte o arquivo aqui" : "Arraste e solte arquivos aqui"}
                      </p>
                      <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0 }}>
                        ou clique para navegar no computador
                      </p>
                      <input
                        id="manual-drive-file-input"
                        type="file"
                        onChange={handleManualFileSelect}
                        style={{ display: 'none' }}
                      />
                    </div>
                  </div>

                </div>

                {/* Explorador de Arquivos na Nuvem */}
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-color)' }}>
                      Pasta: 📜 Consultório Dra. Fabíola
                    </h3>
                    <span className="badge badge-blue">
                      {driveFiles.length} {driveFiles.length === 1 ? 'arquivo' : 'arquivos'}
                    </span>
                  </div>

                  {driveLoading && driveFiles.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: 'var(--primary-color)' }} />
                      <p className="text-muted">Conectando e lendo a pasta do Google Drive...</p>
                    </div>
                  ) : driveFiles.length === 0 ? (
                    <div className="empty-state" style={{ padding: '3rem 0' }}>
                      <Cloud className="empty-icon" />
                      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Nenhum arquivo encontrado</p>
                      <p className="text-muted" style={{ fontSize: '0.85rem' }}>Gere um backup geral acima ou exporte o prontuário de um paciente na aba de Fichas.</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Nome do Arquivo</th>
                            <th>Tipo</th>
                            <th>Criado Em</th>
                            <th className="text-right">Ações de Nuvem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {driveFiles.map((file) => {
                            const isBackup = file.name.endsWith('.json');
                            const isProntuario = file.name.endsWith('.md');
                            
                            return (
                              <tr key={file.id}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FileText size={16} className="text-muted" />
                                    <strong style={{ fontSize: '0.9rem' }}>{file.name}</strong>
                                  </div>
                                </td>
                                <td>
                                  {isBackup ? (
                                    <span className="badge badge-orange" style={{ fontSize: '0.75rem' }}>Backup Geral</span>
                                  ) : isProntuario ? (
                                    <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>Ficha Paciente</span>
                                  ) : (
                                    <span className="badge badge-green" style={{ fontSize: '0.75rem' }}>Outro Anexo</span>
                                  )}
                                </td>
                                <td style={{ fontSize: '0.85rem' }}>
                                  {new Date(file.createdTime).toLocaleString('pt-BR')}
                                </td>
                                <td className="text-right">
                                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    {isBackup ? (
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        title="Restaurar este ponto de backup"
                                        onClick={() => restoreSystemFromDrive(file.id, file.name)}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
                                      >
                                        <RefreshCw size={12} /> Restaurar
                                      </button>
                                    ) : (
                                      file.webViewLink && (
                                        <a
                                          href={file.webViewLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="btn btn-secondary btn-sm"
                                          title="Visualizar arquivo original no Google Drive"
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                        >
                                          <Download size={12} /> Abrir Drive
                                        </a>
                                      )
                                    )}
                                    <button
                                      className="btn btn-icon btn-sm text-red"
                                      title="Excluir arquivo permanentemente do Drive"
                                      onClick={() => handleDeleteDriveFile(file.id, file.name)}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

        </div>
      </main>

      {/* ================= MODAIS ================= */}

      {/* Modal: Cadastro/Edição de Paciente */}
      <div id="patient-modal" className={`modal-overlay ${isPatientModalActive ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setIsPatientModalActive(false)}>
        <div className="modal modal-lg">
          <div className="modal-header">
            <h3 id="patient-modal-title">{editingPatient ? "Editar Cadastro de Paciente" : "Cadastrar Novo Paciente"}</h3>
            <button className="btn-close-modal" onClick={() => setIsPatientModalActive(false)}><X /></button>
          </div>
          <form id="patient-form" onSubmit={handleSubmitPatient}>
            <div className="modal-body modal-scrollable">
              <h4 className="form-section-title">Dados Pessoais</h4>
              <div className="form-row">
                <div className="form-group col-2">
                  <label htmlFor="patient-name">Nome Completo *</label>
                  <input type="text" id="patient-name" className="form-control" required placeholder="Ex: João da Silva" value={pName} onChange={(e) => setPName(e.target.value)} />
                </div>
                <div className="form-group col">
                  <label htmlFor="patient-cpf">CPF *</label>
                  <input type="text" id="patient-cpf" className="form-control" required placeholder="Ex: 000.000.000-00" value={pCpf} onChange={(e) => setPCpf(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group col">
                  <label htmlFor="patient-dob">Data de Nascimento *</label>
                  <input type="date" id="patient-dob" className="form-control" required value={pDob} onChange={(e) => setPDob(e.target.value)} />
                </div>
                <div className="form-group col">
                  <label htmlFor="patient-gender">Gênero *</label>
                  <select id="patient-gender" className="form-select" required value={pGender} onChange={(e) => setPGender(e.target.value)}>
                    <option value="">Selecione...</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div className="form-group col">
                  <label htmlFor="patient-phone">Telefone/WhatsApp *</label>
                  <input type="tel" id="patient-phone" className="form-control" required placeholder="Ex: (11) 99999-9999" value={pPhone} onChange={(e) => setPPhone(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="patient-email">E-mail *</label>
                <input type="email" id="patient-email" className="form-control" required placeholder="Ex: joao@email.com" value={pEmail} onChange={(e) => setPEmail(e.target.value)} />
              </div>

              <h4 className="form-section-title margin-top">Ficha de Anamnese (Saúde Geral)</h4>
              <div className="form-row">
                <div className="form-group col">
                  <label htmlFor="patient-allergies">Alergias Alimentares / Medicamentosas</label>
                  <input type="text" id="patient-allergies" className="form-control" placeholder="Ex: Penicilina, Iodo, Corantes... (Deixe em branco se nenhuma)" value={pAllergies} onChange={(e) => setPAllergies(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group col-checkbox">
                  <label className="checkbox-container">
                    <input type="checkbox" id="patient-hypertension" checked={pHypertension} onChange={(e) => setPHypertension(e.target.checked)} />
                    <span className="checkmark"></span>
                    Paciente Hipertenso
                  </label>
                </div>
                <div className="form-group col-checkbox">
                  <label className="checkbox-container">
                    <input type="checkbox" id="patient-diabetes" checked={pDiabetes} onChange={(e) => setPDiabetes(e.target.checked)} />
                    <span className="checkmark"></span>
                    Paciente Diabético
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="patient-meds">Medicamentos em Uso Contínuo</label>
                <input type="text" id="patient-meds" className="form-control" placeholder="Ex: AAS, Losartana... (Deixe em branco se nenhum)" value={pMeds} onChange={(e) => setPMeds(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="patient-anamnese-notes">Outras Observações Médicas</label>
                <textarea id="patient-anamnese-notes" className="form-control" rows={2} placeholder="Observações importantes sobre a saúde do paciente..." value={pAnamneseNotes} onChange={(e) => setPAnamneseNotes(e.target.value)}></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsPatientModalActive(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar Paciente</button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal: Agendamento / Edição de Consulta */}
      <div id="appointment-modal" className={`modal-overlay ${isAppointmentModalActive ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setIsAppointmentModalActive(false)}>
        <div className="modal">
          <div className="modal-header">
            <h3 id="appointment-modal-title">{editingAppointment ? "Editar Consulta" : "Agendar Nova Consulta"}</h3>
            <button className="btn-close-modal" onClick={() => setIsAppointmentModalActive(false)}><X /></button>
          </div>
          <form id="appointment-form" onSubmit={handleSubmitAppointment}>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="appointment-patient">Selecionar Paciente *</label>
                <select id="appointment-patient" className="form-select" required value={appPatient} onChange={(e) => setAppPatient(e.target.value)}>
                  <option value="">Selecione um paciente...</option>
                  {patients
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name} (CPF: {p.cpf})</option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="appointment-dentist">Dentista Responsável *</label>
                <select id="appointment-dentist" className="form-select" required value={appDentist} onChange={(e) => setAppDentist(e.target.value)}>
                  <option value="">Selecione um dentista...</option>
                  <option value="Dra. Fabíola Monteiro">Dra. Fabíola Monteiro (Ortodontia & Estética)</option>
                  <option value="Dr. Carlos Silva">Dr. Carlos Silva (Clínico Geral)</option>
                  <option value="Dr. Mateus Santos">Dr. Mateus Santos (Endodontista)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="appointment-procedure">Procedimento *</label>
                <select id="appointment-procedure" className="form-select" required value={appProcedure} onChange={(e) => setAppProcedure(e.target.value)}>
                  <option value="">Selecione um procedimento...</option>
                  {procedures
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(pr => (
                      <option key={pr.id} value={pr.id}>{pr.name} (R$ {pr.price.toFixed(2)})</option>
                    ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group col">
                  <label htmlFor="appointment-date">Data da Consulta *</label>
                  <input type="date" id="appointment-date" className="form-control" required value={appDate} onChange={(e) => setAppDate(e.target.value)} />
                </div>
                <div className="form-group col">
                  <label htmlFor="appointment-time">Horário *</label>
                  <select id="appointment-time" className="form-select" required value={appTime} onChange={(e) => setAppTime(e.target.value)}>
                    <option value="">Selecione...</option>
                    <option value="08:00">08:00</option>
                    <option value="08:30">08:30</option>
                    <option value="09:00">09:00</option>
                    <option value="09:30">09:30</option>
                    <option value="10:00">10:00</option>
                    <option value="10:30">10:30</option>
                    <option value="11:00">11:00</option>
                    <option value="11:30">11:30</option>
                    <option value="13:30">13:30</option>
                    <option value="14:00">14:00</option>
                    <option value="14:30">14:30</option>
                    <option value="15:00">15:00</option>
                    <option value="15:30">15:30</option>
                    <option value="16:00">16:00</option>
                    <option value="16:30">16:30</option>
                    <option value="17:00">17:00</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="appointment-status">Status do Agendamento *</label>
                <select id="appointment-status" className="form-select" required value={appStatus} onChange={(e) => setAppStatus(e.target.value)}>
                  <option value="scheduled">Agendado</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="completed">Concluído</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAppointmentModalActive(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Confirmar Agendamento</button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal: Adicionar/Editar Procedimento */}
      <div id="procedure-modal" className={`modal-overlay ${isProcedureModalActive ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setIsProcedureModalActive(false)}>
        <div className="modal">
          <div className="modal-header">
            <h3 id="procedure-modal-title">{editingProcedure ? "Editar Procedimento" : "Cadastrar Novo Procedimento"}</h3>
            <button className="btn-close-modal" onClick={() => setIsProcedureModalActive(false)}><X /></button>
          </div>
          <form id="procedure-form" onSubmit={handleSubmitProcedure}>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="procedure-name">Nome do Procedimento *</label>
                <input type="text" id="procedure-name" className="form-control" required placeholder="Ex: Clareamento Dental" value={procName} onChange={(e) => setProcName(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="procedure-price">Valor Padrão (R$) *</label>
                <input type="number" id="procedure-price" className="form-control" required min="0" step="0.01" placeholder="Ex: 350.00" value={procPrice} onChange={(e) => setProcPrice(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsProcedureModalActive(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal: Prontuário Completo do Paciente */}
      <div id="patient-profile-modal" className={`modal-overlay ${isPatientProfileModalActive ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setIsPatientProfileModalActive(false)}>
        <div className="modal modal-lg">
          <div className="modal-header">
            <h3>Prontuário e Ficha Clínica</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto', marginRight: '1rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => exportPatientCardToDrive(viewingPatient)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', border: '1px solid var(--primary-color)', color: 'var(--primary-color)' }}
                title="Exportar Prontuário Completo para o Google Drive"
              >
                <Cloud size={14} /> Exportar para o Drive
              </button>
            </div>
            <button className="btn-close-modal" onClick={() => setIsPatientProfileModalActive(false)}><X /></button>
          </div>
          {viewingPatient && (
            <div className="modal-body modal-scrollable">
              <div className="profile-header-card">
                <div className="profile-avatar">
                  <User />
                </div>
                <div className="profile-meta">
                  <h4 id="profile-patient-name">{viewingPatient.name}</h4>
                  <p className="text-muted"><span id="profile-patient-gender">{viewingPatient.gender}</span> — Nascimento: <span id="profile-patient-dob">{formatDate(viewingPatient.dob)}</span></p>
                  <div className="profile-contact">
                    <span><CreditCard /> CPF: <span id="profile-patient-cpf">{viewingPatient.cpf}</span></span>
                    <span><Phone /> <span id="profile-patient-phone">{viewingPatient.phone}</span></span>
                    <span><Mail /> <span id="profile-patient-email">{viewingPatient.email}</span></span>
                  </div>
                </div>
              </div>

              {/* Alertas e Ficha de Saúde (Anamnese) */}
              <div className="anamnese-summary-box">
                <h5>Anamnese de Saúde Geral</h5>
                <ul className="anamnese-list">
                  <li><strong>Alergias:</strong> <span id="profile-patient-allergies" className={viewingPatient.medicalHistory.allergies ? "text-red" : ""}>{viewingPatient.medicalHistory.allergies || "Nenhuma registrada"}</span></li>
                  <li><strong>Pressão Arterial:</strong> <span id="profile-patient-hypertension" className={viewingPatient.medicalHistory.hypertension ? "text-orange" : ""}>{viewingPatient.medicalHistory.hypertension ? "Hipertenso ⚠️" : "Normal"}</span></li>
                  <li><strong>Diabetes:</strong> <span id="profile-patient-diabetes" className={viewingPatient.medicalHistory.diabetes ? "text-orange" : ""}>{viewingPatient.medicalHistory.diabetes ? "Diabético ⚠️" : "Não Diabético"}</span></li>
                  <li><strong>Medicamentos em uso:</strong> <span id="profile-patient-meds">{viewingPatient.medicalHistory.meds || "Nenhum"}</span></li>
                  <li><strong>Observações gerais:</strong> <span id="profile-patient-notes">{viewingPatient.medicalHistory.notes || "-"}</span></li>
                </ul>
              </div>

              {/* Histórico de Consultas */}
              <h4 className="section-subtitle">Histórico de Consultas e Agendamentos</h4>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Data/Horário</th>
                      <th>Dentista</th>
                      <th>Procedimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="profile-appointments-table-body">
                    {patientAppointmentsInProfile.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-muted" style={{ textAlign: "center" }}>Nenhum agendamento para este paciente.</td>
                      </tr>
                    ) : (
                      patientAppointmentsInProfile.map(app => {
                        const proc = procedures.find(p => p.id === app.procedureId);
                        return (
                          <tr key={app.id}>
                            <td><strong>{formatDate(app.date)}</strong> às {app.time}</td>
                            <td>{app.dentist}</td>
                            <td>{proc ? proc.name : "Procedimento Geral"}</td>
                            <td>R$ {proc ? proc.price.toFixed(2) : "0,00"}</td>
                            <td><span className={`badge ${statusBadges[app.status]}`}>{statusLabels[app.status]}</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Anotações Clínicas / Evolução */}
              <h4 className="section-subtitle margin-top font-semibold text-lg">Evolução Clínica / Notas do Dentista</h4>
              <div className="clinical-evolution-box">
                <textarea id="profile-clinical-notes" className="form-control" rows={4} placeholder="Adicione notas de evolução clínica do paciente aqui..." value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)}></textarea>
                <div className="clinical-evolution-actions">
                  <button type="button" id="save-clinical-notes-btn" className="btn btn-primary btn-sm" onClick={handleSaveClinicalNotes}>
                    <Save /> Salvar Notas Clínicas
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setIsPatientProfileModalActive(false)}>Fechar</button>
          </div>
        </div>
      </div>

      {/* Modal Customizado: Alerta / Confirmação */}
      <div className={`modal-overlay ${customDialog.isOpen ? 'active' : ''}`} style={{ zIndex: 9999 }}>
        <div className="modal" style={{ maxWidth: '440px', padding: '1.75rem', background: 'var(--bg-modal)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-premium)', borderRadius: '16px', display: 'block' }}>
          <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: 'none', padding: '0 0 1rem 0' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              backgroundColor: customDialog.type === 'confirm' ? 'var(--color-danger-translucent, rgba(239, 68, 68, 0.15))' : 'var(--color-primary-translucent, rgba(140, 79, 110, 0.15))',
              color: customDialog.type === 'confirm' ? 'var(--color-danger, #ef4444)' : 'var(--color-primary)'
            }}>
              {customDialog.type === 'confirm' ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
            </div>
            <h3 style={{ fontSize: '1.25rem', fontFamily: 'var(--font-sans)', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              {customDialog.title}
            </h3>
          </div>
          <div className="modal-body" style={{ padding: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
            <p style={{ margin: 0 }}>{customDialog.message}</p>
          </div>
          <div className="modal-footer" style={{ borderTop: 'none', padding: 0, justifyContent: 'flex-end', gap: '0.75rem' }}>
            {customDialog.type === 'confirm' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeCustomDialog}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              >
                {customDialog.cancelText || 'Cancelar'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (customDialog.type === 'confirm' && customDialog.onConfirm) {
                  customDialog.onConfirm();
                }
                closeCustomDialog();
              }}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                backgroundColor: customDialog.type === 'confirm' ? 'var(--color-danger, #ef4444)' : 'var(--color-primary)',
                borderColor: customDialog.type === 'confirm' ? 'var(--color-danger, #ef4444)' : 'var(--color-primary)'
              }}
            >
              {customDialog.confirmText || 'OK'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
