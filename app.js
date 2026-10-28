// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
const APP = {
  lang: 'es',
  view: 'dashboard',
  user: null,
  wizardStep: 0,
  navHistory: [],  // view history stack
  wizardData: {},
  notifOpen: false,
};

// ═══════════════════════════════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════════════════════════════
const SUPA_URL = 'https://rbspxqwranfuhemyzduq.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJic3B4cXdyYW5mdWhlbXl6ZHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjc5MzEsImV4cCI6MjA4OTYwMzkzMX0.-vB51tU8ob1z7lvK1wMxzfcJc77IQz9yiNsgO_gR7lY';

// Todo pasa por el intermediario "raiz-api". El navegador nunca toca las tablas.
const API_URL = window.RAIZ_API_URL || (SUPA_URL + '/functions/v1/raiz-api');
async function api(action, payload){
  let r, j = {};
  try{
    r = await fetch(API_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'x-raiz-token':LS.get('token')||''},
      body: JSON.stringify(Object.assign({action}, payload||{}))
    });
  }catch(e){ const err=new Error('Sin conexión con el servidor'); err.code='network'; throw err; }
  try{ j = await r.json(); }catch(e){}
  if(!r.ok || j.error){
    const err = new Error(j.message || ('Error ' + r.status)); err.code = j.error || 'http'; err.status = r.status;
    if(r.status===401 && action!=='login' && action!=='register') sessionExpired();
    throw err;
  }
  return j;
}
let _expiredShown = false;
function sessionExpired(){
  LS.del('token');
  if(APP.user && !_expiredShown){ _expiredShown = true; APP.user = null; renderAuth(); setTimeout(()=>{ showAuthErr('Tu sesión venció. Ingresá de nuevo.'); _expiredShown=false; }, 100); }
}
// Compatibilidad con el resto del código (solo OCC)
const SB = {
  async get(){ return []; },
  async insert(table, data){ if(table!=='occs') throw new Error('tabla no permitida'); const j = await api('occ.insert',{occ:data}); return j.occ; },
  async update(table, id, data){ if(table!=='occs') return false; try{ await api('occ.update',{id, fields:data}); return true; }catch(e){ console.error(e); if(e.status===403) toast(e.message,'error'); return false; } },
  async delete(table, id){ await api('occ.delete',{id}); return true; }
};

// ═══════════════════════════════════════════════════════
// LOCAL STORAGE — solo para preferencias UI (tema, idioma)
// ═══════════════════════════════════════════════════════
const STORE_PREFIX  = 'raiz_app_';
const FREE_OCC_LIMIT = 5;

function getPlan(){ return (APP.user && APP.user.plan) || LS.get('plan') || 'free'; }
function setPlan(p){ LS.set('plan', p); }
function isFreePlan(){ return false; } // beta: sin límite de OCC

function getUserOCCs(){ return (APP._occs||[]).filter(o => o.createdBy !== undefined); }
function userOCCCount(){ return (APP._occs||[]).filter(o => o.id > 1000000).length; }

const LS = {
  get(k){
    try { const v = localStorage.getItem(STORE_PREFIX + k); if(v !== null) return JSON.parse(v); } catch(e){}
    return null;
  },
  set(k, v){ try { localStorage.setItem(STORE_PREFIX + k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem(STORE_PREFIX + k); } catch(e){} }
};

// ═══════════════════════════════════════════════════════
// DATA CACHE — los datos se cargan una vez en APP._occs / APP._users
// ═══════════════════════════════════════════════════════
function getTenantDomain(){
  if(!APP.user) return null;
  return (APP.user.email||'').split('@')[1]?.toLowerCase() || 'unknown';
}
function isRetak(){ const d = getTenantDomain(); return !d || d === 'retak.com.ar'; }

// Sync wrappers — devuelven cache local (ya cargado al login)
function getOCCs(){ return APP._occs || []; }
function saveOCCs(list){ APP._occs = list; } // legacy compat — saves happen via saveNewOCC/deleteOCC async
function getNotifs(){ return APP._notifs || []; }
function saveNotifs(list){ APP._notifs = list; }
function getUsers(){ return APP._users || []; }
function saveUsers(list){ APP._users = list; }

// ── Async loaders ─────────────────────────────────────
async function loadTenantData(){
  const j = await api('boot');
  APP.user = Object.assign({}, APP.user||{}, j.user);
  APP._tenant = j.tenant || null;
  APP._users = j.users || [];
  const dbOCCs = (j.occs||[]).map(normalizeOCC);
  APP._occs = (isRetak() && dbOCCs.length===0) ? getDefaultOCCs() : dbOCCs;
  APP._notifs = j.notifs || [];
}
async function loadUsers(){ /* incluido en loadTenantData */ }

// Normalize OCC from DB format to app format
function normalizeOCC(o){
  return {
    id: o.id, num: o.num, date: o.date,
    problem: o.problem, responsable: o.responsable,
    area: o.area, integrantes: o.integrantes||'',
    status: o.status,
    causes: o.causes || {maquinaria:[],mano:[],medio:[],materiales:[],metodos:[],otros:[]},
    whys: o.whys || [],
    actions: o.actions || [],
    impact: o.impact, evidencia: o.evidencia||'',
    learning: o.learning||'',
    photos: o.photos||[],
    context: o.context||{},
    createdBy: o.created_by,
    tenant_id: o.tenant_id,
  };
}

initTheme();

// ── THEME TOGGLE ─────────────────────────────────────────────────────────────
function initTheme(){
  setTimeout(updateThemeToggleUI, 50);
  const saved = LS.get('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  APP.theme = saved;
}
function toggleTheme(){
  const next = APP.theme === 'dark' ? 'light' : 'dark';
  APP.theme = next;
  LS.set('theme', next);
  document.documentElement.setAttribute('data-theme', next);
  updateThemeToggleUI();
}
function updateThemeToggleUI(){
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if(icon)  icon.textContent  = APP.theme==='dark' ? '🌙' : '☀️';
  if(label) label.textContent = APP.theme==='dark'
    ? (APP.lang==='es'?'Modo oscuro':'Dark mode')
    : (APP.lang==='es'?'Modo claro':'Light mode');
}

// (data functions defined above in Supabase section)

// ═══════════════════════════════════════════════════════
// I18N
// ═══════════════════════════════════════════════════════
const T = {
  es:{
    login:'Iniciar sesión', register:'Registrarse', email:'Correo electrónico', password:'Contraseña',
    name:'Nombre completo', role:'Rol', area:'Área', company:'Empresa',
    roles:['operario','supervisor','admin'], roleLabels:['Operario','Supervisor','Admin'],
    areas:['Producción','Mantenimiento','Calidad','Logística','Otros'],
    dashboard:'Inicio',occ:'OCC',insights:'Análisis',users:'Usuarios',notifications:'Notificaciones',
    logout:'Cerrar sesión',
    newOCC:'Nueva OCC',
    totalOCC:'Total OCC',open:'Abiertas',overdue:'Vencidas',solved:'Resueltas',myPending:'Mis pendientes',
    alerts:'Alertas críticas',recurrence:'Reincidencia por problema',
    colDate:'Fecha',colNum:'N°',colProblem:'Problema',colResp:'Responsable',colStatus:'Estado',colRecur:'Reincidencia',
    stOpen:'Pendiente',stClosed:'Cerrada',stAnalysis:'Análisis',
    wizTitle:'Nueva OCC',wizard:'Nueva OCC',
    steps:['Contexto','Problema','Causas','5 Porqués','Acciones','Seguimiento'],
    step0:'Contexto del Evento',step0sub:'Respondé cada pregunta con datos reales. Este contexto le permite a la IA verificar que la formulación del problema sea válida.',
    step1:'Formulación del Problema',step1sub:'El sistema valida que la formulación refleje un hecho observable y sea consistente con el contexto registrado.',
    step2:'Diagrama de Ishikawa',step2sub:'Listá causas posibles en cada categoría. Seleccioná (✓) las que analizarás con 5 Porqués.',
    step3:'5 Porqués',step3sub:'Cada respuesta debe ser un hecho observable. La IA detecta razonamiento hacia atrás en tiempo real.',
    step4:'Plan de Acción',step4sub:'Cada acción = hipótesis explícita: "Si hago X, espero Y medido por Z".',
    step5:'Verificación de Impacto',step5sub:'Obligatorio para cerrar la OCC. ¿Se eliminó la causa raíz?',
    lblProblem:'Título del problema',lblResp:'Responsable',lblDate:'Fecha detección',
    phProblem:'Descripción breve del problema observado...',phResp:'Nombre...',
    lblQue:'¿QUÉ ocurrió exactamente?',lblDonde:'¿DÓNDE ocurrió?',lblCuando:'¿CUÁNDO ocurrió?',
    lblCuantas:'¿CUÁNTAS veces / magnitud?',lblBajo:'¿Bajo qué condiciones?',lblQueNo:'¿Qué NO ocurrió? (límite del problema)',
    phQue:'Evento observable, sin interpretaciones...',phDonde:'Área, equipo, línea...',
    phCuando:'Turno, fecha, frecuencia...',phCuantas:'Cantidad, frecuencia exacta...',
    phBajo:'Variables presentes, condiciones de operación...',phQueNo:'Qué equipos/áreas/turnos NO tuvieron el problema...',
    cats:[['maquinaria','Maquinaria/Equipos','maq'],['mano','Mano de Obra','mano'],['medio','Medio Ambiente','med'],
          ['materiales','Materias Primas','mat'],['metodos','Métodos','met'],['otros','Otros','otr']],
    whyLabels:['1er ¿Por qué?','2do ¿Por qué?','3er ¿Por qué?','4to ¿Por qué?','5to ¿Por qué?'],
    phWhy:'Hecho observable que explica el anterior...',
    colResp2:'Responsable',colObj:'Objetivo / Hipótesis',colDateExp:'Fecha esperada',colDateFin:'Fecha finalización',
    addAction:'+ Agregar acción',
    impTitle:'¿Cuál fue el impacto de las acciones?',
    impPos:'Positivo',impPosSub:'El problema desapareció',
    impPar:'Parcial',impParSub:'Mejoró pero no se eliminó',
    impNeg:'Sin efecto',impNegSub:'No hubo cambio o empeoró',
    impUnk:'Sin datos',impUnkSub:'Necesita más tiempo de observación',
    lblEvidencia:'Evidencia / Observación',phEvidencia:'Qué se observó después de aplicar las acciones...',
    lblLearning:'Aprendizaje / Estandarización',phLearning:'Qué cambia en el proceso, qué se estandariza...',
    cancel:'Cancelar',back:'← Atrás',next:'Continuar →',close:'Guardar y enviar a revisión',save:'Guardar',
    ctx_objeto:'¿Qué objeto, producto o proceso está afectado?',
    ctx_condActual:'¿Cuál es la condición actual observable?',
    ctx_condEsperada:'¿Cuál debería ser la condición esperada (estándar)?',
    ctx_deteccion:'¿Cómo se detectó el problema?',
    ctx_deteccionOpts:['Inspección de calidad','Reclamo interno','Reclamo de cliente','Parada de línea','Medición / control','Observación directa','Otro'],
    ctx_cantidad:'Cantidad de unidades / piezas afectadas',
    ctx_cantidadPh:'Ingresá un número...',
    ctx_impactoTiempo:'Tiempo de parada o impacto (en minutos)',
    ctx_impactoTiempoPh:'Ingresá minutos...',
    ctx_reincidencia:'¿Es la primera vez que ocurre este problema?',
    ctx_turnosNo:'¿En qué turnos NO ocurrió el problema?',
    ctx_turnosNoPh:'Ej: turno mañana, turno tarde...',
    ctx_areasNo:'¿En qué máquinas o áreas NO ocurrió?',
    ctx_areasNoPh:'Ej: autoclave 1 y 2, sector corte...',
    ctx_justPh:'Justificá por qué no podés responder esto...',
    ctx_naLabel:'No aplica / No tengo el dato',
    ctx_aiChecking:'Revisando consistencia interna del contexto...',
    ctx_aiOk:'✓ Contexto validado. Sin inconsistencias detectadas.',
    ctx_aiWarn:'Se detectó una inconsistencia en el contexto:',
    similarFound:'OCC similares en el repositorio',similarSub:'Revisá si este problema ya fue analizado antes de continuar:',
    exportPDF:'Exportar PDF',viewDetail:'Ver detalle',
    notifTitle:'Notificaciones',clearAll:'Marcar todo como leído',noNotifs:'Sin notificaciones nuevas',
    insTitle:'Análisis del Sistema',
    impactSummary:'Resumen de impacto',topProblems:'Problemas más frecuentes',
    topSolvers:'Responsables con más OCC resueltas',actionsByArea:'Acciones pendientes por área',
    usersTitle:'Usuarios registrados',
    occByUser:'OCC a cargo',resolvedByUser:'Resueltas',
    emailSimTitle:'📧 Email simulado enviado',
    loginErr:'Correo o contraseña incorrectos',regErr:'El correo ya está registrado',
    fillFields:'Completá todos los campos obligatorios',
    selCause:'Seleccioná al menos una causa',
    impactReq:'Seleccioná el impacto de las acciones',
    occSaved:'OCC registrada correctamente',
    aiThink:'Procesando...',
  },
  en:{
    login:'Sign in',register:'Sign up',email:'Email',password:'Password',
    name:'Full name',role:'Role',area:'Area',company:'Company',
    roles:['operario','supervisor','admin'],roleLabels:['Operator','Supervisor','Admin'],
    areas:['Production','Maintenance','Quality','Logistics','Other'],
    dashboard:'Inicio',occ:'OCC',insights:'Análisis',users:'Usuarios',notifications:'Notificaciones',
    logout:'Sign out',
    newOCC:'New OCC',
    totalOCC:'Total OCC',open:'Open',overdue:'Overdue',solved:'Resolved',myPending:'My pending',
    alerts:'Critical alerts',recurrence:'Recurrence by problem',
    colDate:'Date',colNum:'#',colProblem:'Problem',colResp:'Responsible',colStatus:'Status',colRecur:'Recurrence',
    stOpen:'Pending',stClosed:'Closed',stAnalysis:'Analysis',
    wizTitle:'New OCC',wizard:'New OCC',
    steps:['Context','Problem','Causes','5 Whys','Actions','Follow-up'],
    step0:'Event Context',step0sub:'Answer each question with real data. This context allows the AI to verify that the problem formulation is valid.',
    step1:'Problem Formulation',step1sub:'AI monitors that the description is coherent with the context you entered. Without coherence, you cannot proceed.',
    step2:'Ishikawa Diagram',step2sub:'List possible causes in each category. Select (✓) which ones you will analyze with 5 Whys.',
    step3:'5 Whys',step3sub:'Each answer must be an observable fact. AI detects backward reasoning in real time.',
    step4:'Action Plan',step4sub:'Each action = explicit hypothesis: "If I do X, I expect Y measured by Z".',
    step5:'Impact Verification',step5sub:'Mandatory to close the OCC. Was the root cause eliminated?',
    lblProblem:'Problem title',lblResp:'Responsible',lblDate:'Detection date',
    phProblem:'Brief description of the observed problem...',phResp:'Name...',
    lblQue:'WHAT exactly happened?',lblDonde:'WHERE did it happen?',lblCuando:'WHEN did it happen?',
    lblCuantas:'HOW MANY times / magnitude?',lblBajo:'Under what conditions?',lblQueNo:'What did NOT happen? (problem boundary)',
    phQue:'Observable event, no interpretations...',phDonde:'Area, equipment, line...',
    phCuando:'Shift, date, frequency...',phCuantas:'Exact quantity, frequency...',
    phBajo:'Present variables, operating conditions...',phQueNo:'Which equipment/areas/shifts did NOT have the problem...',
    cats:[['maquinaria','Machinery/Equipment','maq'],['mano','Manpower','mano'],['medio','Environment','med'],
          ['materiales','Materials','mat'],['metodos','Methods','met'],['otros','Other','otr']],
    whyLabels:['1st Why?','2nd Why?','3rd Why?','4th Why?','5th Why?'],
    phWhy:'Observable fact explaining the previous one...',
    colResp2:'Responsible',colObj:'Objective / Hypothesis',colDateExp:'Expected date',colDateFin:'Completion date',
    addAction:'+ Add action',
    impTitle:'What was the impact of the actions?',
    impPos:'Positive',impPosSub:'Problem disappeared',
    impPar:'Partial',impParSub:'Improved but not eliminated',
    impNeg:'No effect',impNegSub:'No change or worsened',
    impUnk:'No data',impUnkSub:'Needs more observation time',
    lblEvidencia:'Evidence / Observation',phEvidencia:'What was observed after applying the actions...',
    lblLearning:'Learning / Standardization',phLearning:'What changes in the process, what gets standardized...',
    cancel:'Cancel',back:'← Back',next:'Continue →',close:'Close OCC',save:'Save',
    ctx_objeto:'What object, product or process is affected?',
    ctx_condActual:'What is the current observable condition?',
    ctx_condEsperada:'What should the expected condition be (standard)?',
    ctx_deteccion:'How was the problem detected?',
    ctx_deteccionOpts:['Quality inspection','Internal complaint','Customer complaint','Line stoppage','Measurement / control','Direct observation','Other'],
    ctx_cantidad:'Number of affected units / pieces',
    ctx_cantidadPh:'Enter a number...',
    ctx_impactoTiempo:'Downtime or impact duration (in minutes)',
    ctx_impactoTiempoPh:'Enter minutes...',
    ctx_reincidencia:'Is this the first time this problem has occurred?',
    ctx_turnosNo:'In which shifts did the problem NOT occur?',
    ctx_turnosNoPh:'E.g.: morning shift, afternoon shift...',
    ctx_areasNo:'In which machines or areas did it NOT occur?',
    ctx_areasNoPh:'E.g.: autoclave 1 and 2, cutting section...',
    ctx_justPh:'Justify why you cannot answer this...',
    ctx_naLabel:'N/A / I do not have this data',
    ctx_aiChecking:'Reviewing internal consistency of context...',
    ctx_aiOk:'✓ Context validated. No inconsistencies detected.',
    ctx_aiWarn:'An inconsistency was detected in the context:',
    similarFound:'Similar OCC found in repository',similarSub:'Check if this problem was already analyzed before continuing:',
    exportPDF:'Export PDF',viewDetail:'View detail',
    notifTitle:'Notifications',clearAll:'Mark all as read',noNotifs:'No new notifications',
    insTitle:'System Analysis',
    impactSummary:'Impact summary',topProblems:'Most frequent problems',
    topSolvers:'Responsibles with most resolved OCC',actionsByArea:'Pending actions by area',
    usersTitle:'Registered users',
    occByUser:'Assigned OCC',resolvedByUser:'Resolved',
    emailSimTitle:'📧 Simulated email sent',
    loginErr:'Wrong email or password',regErr:'Email already registered',
    fillFields:'Please fill in all required fields',
    selCause:'Select at least one cause',
    impactReq:'Select the impact of the actions',
    occSaved:'OCC registered successfully',
    aiThink:'Processing...',
  }
};
const t = () => T[APP.lang];

// ═══════════════════════════════════════════════════════
// DEFAULT DATA
// ═══════════════════════════════════════════════════════
function getDefaultOCCs(){
  const REAL_OCCS = [
  {
    "id": 1,
    "num": 1,
    "date": "2024-09-26",
    "problem": "Baja resistencia a compresión",
    "responsable": "FC",
    "area": "Calidad",
    "integrantes": "MN · MM · FH · Sup",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Ladrillos muy húmedos al salir de autoclaves",
        "answers": [
          "Se acumula mucha agua dentro de los autoclaves",
          "Titulo de vapor muy bajo (vapor muy húmedo)/Desagote de agua de autoclaves es deficiente",
          "Arrastre de agua de la línea de vapor (desde caldera hasta autoclave)/Por problemas en las trampas de agua",
          "Linea de vapor inundadas/Generación de espuma dentro de la caldera/Nivel de agua en caldera demasiado alto/Desgaste interno de la trampa",
          "Falla de purgas en la linea de vapor/Falta de aislación en cañerías/Conductividad alta/Problemas en el sistema modulante de ingreso de agua/Lectura incorrecta en nivel de agua/Vida útil agotada"
        ]
      },
      {
        "cause": "Irregular presión de mantenimiento de autoclaves",
        "answers": [
          "Válvula reguladora no funciona correctamente/Variación de la presión de la caldera",
          "Mantenimiento deficiente/Fin de la vida útil/Calibración del quemador/Problemas en el sistema modulante de ingreso de agua",
          "Desconocemos si hay un plan de mantenimiento preventivo",
          "",
          ""
        ]
      },
      {
        "cause": "Variación en la resistencia a compresión en húmedo",
        "answers": [
          "Variación entre equipos (camiones) de cemento",
          "Diferencias en lotes de cemento/Contaminación en equipos (camión)/Transportista puede rotar los acopios de MP",
          "Norma de fabricación de cemento demasiado amplia para uso en HCCA/No hay limpieza eficiente de tolva entre cargas",
          "No hay cemento específico para HCCA",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "FC",
        "objective": "Completar aislación en cañerias de linea de vapor",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "FC",
        "objective": "Chequeo de realización correcta de purga de fondo",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "FC",
        "objective": "Reparación del sistema modulante del ingreso de agua a caldera",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "FC",
        "objective": "Verificación del nivel de agua en caldera",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "FC",
        "objective": "Realización de auditoría y control a las trampas de las autoclaves",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "FC",
        "objective": "Averiguar si la valvula reguladora cuenta con un plan preventivo de mantenimiento",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "FC",
        "objective": "Verificación de la calibración del quemador de la caldera",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "FC",
        "objective": "Reparación del sistema modulante del ingreso de agua a caldera",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "FC",
        "objective": "Pedir protocolo de análisis del cemento CPC40 al proveedor",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Resistencia dentro de especificación en controles posteriores",
    "learning": "Control de purgas y trampas de vapor incorporado al plan de MP"
  },
  {
    "id": 2,
    "num": 2,
    "date": "2024-10-03",
    "problem": "Barro con densidad baja",
    "responsable": "EDUARDO BELLA",
    "area": "Producción",
    "integrantes": "",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Llave rota",
        "answers": [
          "Desgaste por uso",
          "Se corta eje",
          "",
          "",
          ""
        ]
      },
      {
        "cause": "Llave mal cerrada",
        "answers": [
          "no se ve que esta mal cerrada",
          "esta detras del filtro",
          "",
          "",
          ""
        ]
      },
      {
        "cause": "Falta de arena en cinta",
        "answers": [
          "Cinta transportadora vacía",
          "no cae arena",
          "Arena mojada",
          "poca arena en tolba",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "EDUARDO BELLA",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Densidad de barro controlada en rango en mediciones posteriores",
    "learning": "Llave reubicada en zona visible; procedimiento de control de arena actualizado"
  },
  {
    "id": 3,
    "num": 3,
    "date": "2024-10-03",
    "problem": "Dintel descartado en verde",
    "responsable": "Eduardo Bella",
    "area": "Calidad",
    "integrantes": "Ernesto Beron",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Se corre chapa reguladora de medida",
        "answers": [
          "chapa mal puesta",
          "falta de soporte",
          "soporte regulable defectuoso",
          "Falta de perno de regulacion de soporte",
          "Se sale perno de regulacion"
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Eduardo Bella",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Sin descarte de dinteles en verde el mes siguiente",
    "learning": "Topes no regulables fabricados e incorporados al proceso"
  },
  {
    "id": 4,
    "num": 4,
    "date": "2024-10-05",
    "problem": "Ladrillos fuera de medidas en corte longitudinal",
    "responsable": "Obeid Yair",
    "area": "Calidad",
    "integrantes": "Ramiro Guzmán · Akerman Hector.",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "ranuras de maquina de corte",
        "answers": [
          "el alambre quedó fuera de la ranura",
          "la ranura es poco visible y angosta",
          "esta fabricada de un caucho oscuro y opaco que se camufla con el alambre de corte",
          "es parte de la maquina de corte original",
          "el producto se instalo asi desde fabrica"
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Obeid Yair",
        "objective": "Se fabrican y colocan guias de pvc blancas que aumentan la profundidad de la ranura y facilitan la visualización del operario",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Dimensiones dentro de tolerancia en controles posteriores",
    "learning": "Guías de PVC blancas instaladas en todas las ranuras de corte"
  },
  {
    "id": 5,
    "num": 5,
    "date": "2024-10-07",
    "problem": "En sistema de producción se registran bases y salas con numeros que no son reales",
    "responsable": "Matías Navarro",
    "area": "Producción",
    "integrantes": "Matías Navarro · Néstor Zalazar · Agustín Fernandez",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "El sistema permite colocar numeración que no es real",
        "answers": [
          "Había bases y cajas que no estaban identificadas",
          "El sistema obliga (enclavamiento) a completar campos para poder dar continuidad a la registración",
          "Se incorporó la opción de poder colocar numeración no real cuando se detectan bases sin el número idenfificatorio",
          "Luego de que se numeraran bases y cajas no se suprimió en el sistema la opción de utilizar númeron inexistentes",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Matías Navarro",
        "objective": "Realizar las correcciónes para poder registrar lo real",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Sin errores de registración el mes siguiente al cierre",
    "learning": "Sistema corregido; numeración real cargada y validada"
  },
  {
    "id": 6,
    "num": 6,
    "date": "2024-10-09",
    "problem": "No se completa corte tranversal",
    "responsable": "Supervisores",
    "area": "Producción",
    "integrantes": "",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Alambre",
        "answers": [
          "Se corta alambre",
          "Se fatiga antes de tiempo",
          "Se utiliza un alambre fuera de epecificación (más fino)",
          "Por falta de stock del alambre  adecuado",
          "Por falta de abastecimiento"
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Supervisores",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Corte transversal completo sostenido tras reposición de alambre",
    "learning": "Gestión de stock de alambre incorporada al proceso de compras"
  },
  {
    "id": 7,
    "num": 7,
    "date": "2023-09-10",
    "problem": "Rotura de rosca en vastago de cilindro hidraulico ( pernos rotador)",
    "responsable": "Andrés Reynoso",
    "area": "Mantenimiento",
    "integrantes": "",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Fatiga de material en rosca de eje",
        "answers": [
          "Movimientos de carga repetitivos que generan impacto sobre la rosca",
          "Es donde se vinculan el cilindro hidraulico y perno",
          "Se considera el punto mas debil del sistema",
          "Reduccion en el eje para formar la rosca",
          ""
        ]
      },
      {
        "cause": "Desalineacion de recorrido del perno",
        "answers": [
          "El encuentro entre perno y camisa de bandeja no esta centrado",
          "Desgaste de camisa guia de perno (bastidor) / desalineacion entre mesa y bastidor movil",
          "Ingreso de polvo / falla regulacion de recorrido bastidor movil y falla regulacion cilindros de mesa",
          "El cilindro acarrea suciedad hacia la camisa / dificulltad para corroborar la regulacion entre perno y camisa de bandeja",
          "El cilindro queda a la interperie durante su recorrido / no contamos con procedimiento especifico de alineacion"
        ]
      },
      {
        "cause": "Desajuste de perno",
        "answers": [
          "Movimiento relativo entre el perno y el cilindro hidraulico",
          "Correccion del perno al ingresa a la camisa de la bandeja / porque se afloja roscado entre perno y cilindro",
          "Desalineacion entre bandeja y bastidor / falta de torque de ajuste / falta de pegamento sellarosca",
          "idem causa anterior (generar procedimiento de alineacion) / falta procedimiento de cambio de perno",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Andrés Reynoso",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Sin rotura de rosca en los 3 meses siguientes",
    "learning": "Procedimiento de alineación y cambio de perno generado; eje rediseñado"
  },
  {
    "id": 8,
    "num": 8,
    "date": "2024-10-16",
    "problem": "Mitigación de moldes duros",
    "responsable": "Néstor Zalazar",
    "area": "Producción",
    "integrantes": "",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Moldes fuera de parametro",
        "answers": [
          "Aumento de los tiempos de maduración",
          "Se detiene linea de producción",
          "Reparación de equipo",
          "Por rotura",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Néstor Zalazar",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "partial",
    "evidencia": "Procedimiento de mitigación implementado; impacto en scrap reducido",
    "learning": "Procedimiento de mitigación por moldes duros documentado"
  },
  {
    "id": 9,
    "num": 9,
    "date": "2024-09-30",
    "problem": "falta de alimentación por falla en cinta transportadora de arena molino3",
    "responsable": "Raúl Caballero",
    "area": "Mantenimiento",
    "integrantes": "RAUL CABALERO · MATIAS MUZABER · ANDRES REYNOSO",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "ROLO DE TRACCIÓN",
        "answers": [
          "No hay rozamiento entre rolo tracción y cinta",
          "porque está muy pulida su superficie",
          "por agotamiento de vida útil de engomado",
          "porque no tiene un plan de recambio preventivo",
          ""
        ]
      },
      {
        "cause": "ROLOS DE APOYO",
        "answers": [
          "El rolo no gira",
          "Rodamiento engranado",
          "Mucha corrosión/suciedad superficial/rotura",
          "",
          ""
        ]
      },
      {
        "cause": "ROLOS TENSORES AUXILIARES",
        "answers": [
          "Giraba de manera cruzada",
          "Tiene rodamientos rotos",
          "se supera carga de rodamiento",
          "rodamiento mal dimensionado/lubricación y limpieza deficientes",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Raúl Caballero",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Sin falla en cinta transportadora molino 3 en 2 meses siguientes",
    "learning": "Plan de recambio preventivo de engomado y rodamientos establecido"
  },
  {
    "id": 10,
    "num": 10,
    "date": "2024-10-22",
    "problem": "Desvios en la producción de transformación.",
    "responsable": "Fernandez Agustin",
    "area": "Calidad",
    "integrantes": "Navarro Matias · Silva Dario",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Incumplimiento de la producción",
        "answers": [
          "El personal no cumple con lo planificado, sin argumentar las causas.",
          "No se consulta sobre cual fue el problema por el cual no se cumplió el objetivo.",
          "No hay una rutina de control de desvios y de cumplimiento de objetivos.",
          "",
          ""
        ]
      },
      {
        "cause": "Cambio de rotación",
        "answers": [
          "Falta de personal en transformación",
          "Por cubrir ausencias en la linea de producción",
          "Se definio que el op de transformación cubra ausencias en la linea de producción.",
          "Cuando no hay pedidos de transformación, se prioriza la producción.",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Fernandez Agustin",
        "objective": "Dejar asentado cual fue el problema por el cual no se cumplió el objetivo.",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Desvíos de transformación reducidos; reporte diario implementado",
    "learning": "Rutina de control de desvíos y comunicación de planificación establecida"
  },
  {
    "id": 11,
    "num": 11,
    "date": "2024-10-25",
    "problem": "Moldes fisurados",
    "responsable": "Héctor Akerman",
    "area": "Producción",
    "integrantes": "Florentina Carino · Eduardo Bella · Matías Navarro · Cecilia Otero",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Suciedad en vías en sector donde apoya pestaña de rueda de planchas",
        "answers": [
          "No se realizó limpieza semanal  /  mayor acumulación de aceite sobre las salas",
          "se conto con menor cantidad de horas de parada de planta  /  se cambió el sistema de dosificación",
          "las tareas de mantenimiento requerian menor carga horaria  /  afectaba la seguridad de los operarios del sector",
          "durante paradas de planta no hay lista de prioridad de tareas de limpieza",
          ""
        ]
      },
      {
        "cause": "Suciedad en vías carrileras transbordador de maduración",
        "answers": [
          "caida de material sobre la vía",
          "el molde colado re retira antes de que se vacie la cañería del colador  /  las limpiezas de elementos de laboratorio es arrastrada hacia sector maduración  /  pierde la caja reductora del tornillo de aglomerantes  /  no se limpia luego del enjuague de fin de turno",
          "comienza el movimiento del transbordador cuando se escucha el cierre de la electroválvula  /  desagote de laboratorio cae derectamente en la vía  /  tiene laberinto gastado  /  no hay procedimiento que indique cómo hacerlo",
          "no hay un procedimiento que indique el momento en que se puede accionar el transbordador  /  se desgasta por uso",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Héctor Akerman",
        "objective": "Analizar la sustitución del aceite",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "Héctor Akerman",
        "objective": "Establecer tareas de cumplimiento obligatorio",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "Héctor Akerman",
        "objective": "Modificar desagote de laboratorio para que el agua no caiga en vías de maduración",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "Héctor Akerman",
        "objective": "Implementación de una barre-vías acoplado al transbordador",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "Héctor Akerman",
        "objective": "Generar procedimiento de limpieza posteriór a enjuague de mezclador principal",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "Héctor Akerman",
        "objective": "Reemplazo de laberinto de tornoillo de aglomerantes",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "Héctor Akerman",
        "objective": "Generar procedimiento de vaciado de balde donde caen restos de aglomerantes del tornillo",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Sin fisuras en moldes en controles posteriores",
    "learning": "Lista de prioridades de limpieza y procedimiento de vaciado generados"
  },
  {
    "id": 13,
    "num": 13,
    "date": "2024-11-04",
    "problem": "Dintel con sobrante inferior pegado se rompe al desmoldar",
    "responsable": "Eduardo Bella",
    "area": "Producción",
    "integrantes": "Matías Muzaber · Andrés Reynoso · Cecilia Otero · Matías Navarro",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Moldes, armaduras, espigas y porta espigas fríos al momento de colar",
        "answers": [
          "El molde y las armaduras están frios al momento de la colada",
          "El molde se retira de la sala de maduración al momento de armar el dintel. Las armaduras y espigas estan en zona no calefaccionada",
          "El dintel no se puede armar dentro de las salas de maduración por haber temperaturas no recomendadas parapersonas y luego de armar el dintel, el molde no se vuelve a meter a sala de maduración",
          "El tiempo para que el molde con dientel armado tome temperatura deseada es muy prolongado y dificultaría el colado de dintel",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Eduardo Bella",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Sin rotura de dinteles en desmolde el mes siguiente",
    "learning": "Procedimiento de permanencia adicional del molde de dintel en sala de maduración"
  },
  {
    "id": 14,
    "num": 14,
    "date": "2024-11-11",
    "problem": "Descarrilamiento de moldes",
    "responsable": "Eduardo Bella",
    "area": "Mantenimiento",
    "integrantes": "Otero,Cecilia",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Anclaje y perno de anclaje de vías postizas",
        "answers": [
          "Falta anclaje y pernos",
          "No hay control de faltantes",
          "No hay check in",
          "No hay procedimiento de control",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Eduardo Bella",
        "objective": "Establecer procedimiento de check in de anclaje diario",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Sin descarrilamiento en los 2 meses siguientes",
    "learning": "Check-in diario de anclaje y pernos establecido"
  },
  {
    "id": 15,
    "num": 15,
    "date": "2025-02-12",
    "problem": "Falta de barro de recupero",
    "responsable": "FC-MN",
    "area": "Producción",
    "integrantes": "NZ-MM-AP-CO-GO",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [],
    "actions": [
      {
        "responsable": "FC-MN",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "partial",
    "evidencia": "Frecuencia de falta de BR redujo pero no se eliminó completamente",
    "learning": "Causas raíz adicionales pendientes de análisis (bomba pozo, moldes petizos)"
  },
  {
    "id": 16,
    "num": 16,
    "date": "2025-07-10",
    "problem": "AUTOCLAVE 5 CON LADRILLOS REVENTADOS",
    "responsable": "HECTOR AKERMAN",
    "area": "Calidad",
    "integrantes": "AKERMAN HECTOR · MUZABER MATIAS · OTERO CECILIA · CARINO FLORENTINA",
    "status": "analysis",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "PERDIDA DE VAPOR AFECTANDO EL CAMINO DEL TRASBORDADOR",
        "answers": [
          "PERDIDA PROVENIENTE DE LA JUNTA DE LA TAPA DE AUTOCLAVE",
          "LA JUNTA NO SELLA HERMETICAMENTE",
          "HAY GRIETAS EN LA ZONA DE LA TAPA DONDE ASIENTA LA JUNTA",
          "POR CONDENSADO EN LA LINEA DE VAPOR",
          ""
        ]
      },
      {
        "cause": "SE INTERRUMPE CARGA Y SE DESCARGA LA AUTOCLAVE",
        "answers": [
          "HABIA VAPOR EN EL CAMINO DEL TRASBORDADOR",
          "SE GENERA ZONA INSEGURA PARA LAS PERSONAS",
          "NO HAY FORMA DE CONTENER LA PERDIDA",
          "SALIDA DE VAPOR CON MUCHO RUIDO Y FUERZA",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "HECTOR AKERMAN",
        "objective": "RELLENAR CON SOLDADURA LAS GRIETAS DE LA TAPA",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "HECTOR AKERMAN",
        "objective": "PROCEDIMENTAR ACCIONES ANTE PERDIDA DE VAPOR DURANTE CICLO DE AUTOCLAVE",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": null,
    "evidencia": "",
    "learning": ""
  },
  {
    "id": 17,
    "num": 17,
    "date": "2025-07-11",
    "problem": "descarrilamiento de 2 moldes a la salida del transferidor de rotador(09/07/2025 MOLDE 199 -200)",
    "responsable": "YAIR OBEID",
    "area": "Mantenimiento",
    "integrantes": "YAIR OBEID · MUZABER MATIAS",
    "status": "closed",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "desalineación de vias de transferidor con vias fijas(lado autoclave)",
        "answers": [
          "porque las vias de transferidor y fijas no coinciden",
          "las vias fijas estan mas abiertas que las de salida del transferidor",
          "el material de la via fija se fue abriendo lentamente",
          "el material  se fatigó con el uso y el paso del tiempo",
          "las vias no tienen un refuerzo que evite el pandeo del extremo de la via"
        ]
      },
      {
        "cause": "mal armado de booguie con base blanca",
        "answers": [
          "avanza erraticamente",
          "porque base blanca apoya sobre alguna rueda",
          "el punto de apoyo de base blanca no coincide con el de booguie",
          "porque la base blanca no tiene trabas",
          "por falta de control/seguimiento de las mismas"
        ]
      },
      {
        "cause": "mal armado de booguie con base blanca",
        "answers": [
          "avanza erraticamente",
          "porque base blanca apoya sobre alguna rueda",
          "porque el punto de apoyo de base blanca no coincide con el de booguie",
          "porque no se utiliza trabas de posicionamiento de booguies en vias de paletizado",
          "por falta de la misma o de un procedimiento de uso"
        ]
      },
      {
        "cause": "ruedas de booguies con movimientos axial",
        "answers": [
          "las mismas no giran sobre un mismo eje",
          "cada rodamiento tiene un eje individual",
          "porque la extrutura del booguie esta conformada de esa manera",
          "",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "YAIR OBEID",
        "objective": "Ver contramedidas en análisis",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": "positive",
    "evidencia": "Vías alineadas y refuerzos colocados; sin descarrilamiento posterior",
    "learning": "Trabas de booguies en vías y procedimiento de uso generado"
  },
  {
    "id": 18,
    "num": 18,
    "date": "2026-02-25",
    "problem": "cañeria de barro de recupero sector corte tapada",
    "responsable": "supervisores",
    "area": "Mantenimiento",
    "integrantes": "Bella Eduardo · Obeid Yair · Spessotti Nestor",
    "status": "open",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "bomba neumatica",
        "answers": [
          "la bomba presenta fallas en la función de bombeo",
          "los diafragmas y distribuidores no funcionan corectamente",
          "falta de recambio y mantenimiento de diafragma y desgaste en distribuidores",
          "falta de repuestos",
          "solicitudes de compras aun no aprobadas"
        ]
      },
      {
        "cause": "cañeria de filtro de pozo a filtro ingreso de bomba",
        "answers": [
          "perdida de caudal  y acumulación de residuos en ese tramo de cañerias",
          "los filtros de inspeccion tienen pedidas de vacio",
          "el sellado de sus tapas no es lo suficiente hermetico",
          "sus juntas no estan pegadas con sellador",
          "debido a la constante inspección del filtro"
        ]
      },
      {
        "cause": "lavado de cañerias",
        "answers": [
          "cañeria queda con restos de barro de recupero",
          "tiene un flujo de barro varias horas durante la jornada",
          "se trasila barro cada 45 min aproximadamente",
          "es el tiempo que se demora en la preparacion de dicho barro",
          ""
        ]
      }
    ],
    "actions": [
      {
        "responsable": "supervisores",
        "objective": "Establecer un stock de repuestos de bombas neumaticas que permitan mantener 1 cuerpo de backup e ir realizando mantenimiento de las mismas al momento de recambios",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "supervisores",
        "objective": "cambiar el sistema de acople fijo de cañeria por uno de  acople rapido que permita su limpieza profunda",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "supervisores",
        "objective": "generar una pendiente de 1 cm por metro en toda la cañeria",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "supervisores",
        "objective": "realizar un sistema de camaras de  inspección / generar lups de desechos de barrido de corte a fosa de corte",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": null,
    "evidencia": "",
    "learning": ""
  },
  {
    "id": 19,
    "num": 19,
    "date": "2026-02-25",
    "problem": "moldes con corte sin finalizar",
    "responsable": "Supervisores",
    "area": "Producción",
    "integrantes": "Dario,Silva · Obeid Yair · Bella eduardo · Spessoti Nestor",
    "status": "open",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "plancha negra",
        "answers": [
          "se traba la cuchilla en la ranura de corte",
          "la ranura esta obstruida",
          "la ranura tiene residuos de aceite y polvillo",
          "Escurrimiento de aceite por las ranuras mas proximas a la caja ya armada",
          "No hay una dosificacion estandar de aceite."
        ]
      },
      {
        "cause": "alambre de corte",
        "answers": [
          "el mismo se corta en el recorrido de corte",
          "no soporta la fuerza de tension",
          "la cuchilla le aplica una resistencia mayor de los habitual",
          "la cuchilla se obstuye en el canal de corte",
          "dedido a acumulación de residuos en canal"
        ]
      }
    ],
    "actions": [
      {
        "responsable": "Supervisores",
        "objective": "mejorar el metodo de dosificación de aceite",
        "dateExp": "",
        "dateFin": ""
      },
      {
        "responsable": "Supervisores",
        "objective": "generar regimen de limpieza de canal de corte de bases negras",
        "dateExp": "",
        "dateFin": ""
      }
    ],
    "impact": null,
    "evidencia": "",
    "learning": ""
  },
  {
    "id": 20,
    "num": 20,
    "date": "2026-03-04",
    "problem": "Ladrillos quebrados en ultima fila.",
    "responsable": "Supervisores.",
    "area": "Calidad",
    "integrantes": "Eduardo Bella · Matias Navarro · Fernandez Agusin · FLorentina Carino",
    "status": "open",
    "causes": {
      "maquinaria": [],
      "mano": [],
      "medio": [],
      "materiales": [],
      "metodos": [],
      "otros": []
    },
    "whys": [
      {
        "cause": "Rotador.",
        "answers": [
          "La torta no queda alineada con respecto a la placa.",
          "Las morsas no tienen el mismo recorrido.",
          "Los bastagos al ser roscados cambian de posicion sobre la rosca.",
          "Al tomar las bases las morsas golpean sobre estas y el golpe es absorvido por las roscas.",
          "El diseño no contemplo este movimiento."
        ]
      },
      {
        "cause": "Rotador.",
        "answers": [
          "La torta no queda alineada con respecto a la placa.",
          "Los gatos no están nivelados.",
          "",
          "",
          ""
        ]
      }
    ],
    "actions": [],
    "impact": null,
    "evidencia": "",
    "learning": ""
  },
  {
  "id": 21,
  "num": 21,
  "date": "2026-03-05",
  "problem": "Vagones mal enganchados",
  "responsable": "supervisores",
  "area": "Producción",
  "integrantes": "Agustin Fernandes · Matias Navarro · Andres Reynoso · Matias Muzzaber · Ayala Alexis",
  "status": "open",
  "causes": {
    "maquinaria": [
      "La plancha blanca no para siempre igual en el rotador",
      "Herramienta de enganche no es efectiva"
    ],
    "mano": [
      "Personal no capacitado"
    ],
    "medio": [],
    "materiales": [],
    "metodos": [],
    "otros": [
      "No hay estandar definido de como enganchar los vagones"
    ]
  },
  "whys": [
    {
      "cause": "No hay un estandar definido de como enganchar los vagones",
      "answers": [
        "no se tuvo en cuenta la operación con personal nuevo",
        "",
        "",
        "",
        ""
      ]
    },
    {
      "cause": "Personal no capasitado",
      "answers": [
        "Falta de un procedimento claro",
        "Le faltan detalles de la operación cuando el vagon queda mal armado",
        "cuando el vagon viene mal armado cambia la forma de engancharlo",
        "",
        ""
      ]
    },
    {
      "cause": "Herramienta de enganche no es efectiva",
      "answers": [
        "cuando llega mal armado el vagon queda corta",
        "porque esta hecha de una medida estandar que es muy corta en algunos casos puntuales",
        "",
        "",
        ""
      ]
    }
  ],
  "actions": [
    {
      "responsable": "supervisores",
      "objective": "Generar un estandar de como enganchar los moldes cuando vienen bien acomodados y cuando vienen mal acomodados",
      "dateExp": "",
      "dateFin": ""
    },
    {
      "responsable": "supervisores",
      "objective": "Mejorar el procedimiento y capasitar a todos los operadores",
      "dateExp": "",
      "dateFin": ""
    },
    {
      "responsable": "supervisores",
      "objective": "Armar herramientas de enganche que sean utiles para cuando queda mal armado el vagon",
      "dateExp": "",
      "dateFin": ""
    }
  ],
  "impact": null,
  "evidencia": "",
  "learning": ""
},
  {
  "id": 22,
  "num": 22,
  "date": "2026-03-07",
  "problem": "falta de barro de recupero",
  "responsable": "supervisores",
  "area": "Producción",
  "integrantes": "Obeid  Yair",
  "status": "open",
  "causes": {
    "maquinaria": [],
    "mano": [],
    "medio": [],
    "materiales": [],
    "metodos": [],
    "otros": [
      "bajo stock de barro de recupero",
      "poco residuo seco de corte de molde"
    ]
  },
  "whys": [
    {
      "cause": "poco residuo seco de corte de molde",
      "answers": [
        "la altura de los moldes no es la adecuada",
        "los moldes quedaron por debajo del borde de caja",
        "la formula nº 57 es muy sensible al cambio de densidades",
        "la misma tiene menos solidos que la formula de uso habitual",
        "es usada para material con baja resistencia a la compresión"
      ]
    },
    {
      "cause": "bajo stock de barro de recupero",
      "answers": [
        "al iniciar la producción post parada semanal queda poco stock",
        "el barro generado tirando moldes colados solo con recupero no es suficiente",
        "se consume todo el barro en la primer vuelta de moldes",
        "durante la primer vuelta solo se consume barro y no se genera",
        "los moldes no egresan de sala para generar barro recuperable"
      ]
    },
    {
      "cause": "bajo stock de barro de recupero",
      "answers": [
        "al iniciar la producción post parada semanal queda poco stock",
        "falta de lugar de acopio",
        "una de las bateas y el silo chico no estan en uso",
        "debido a falta de limpieza/falta de bomba neumatica",
        "falla del plan de limpieza /  falta de repuestos de bombas"
      ]
    }
  ],
  "actions": [
    {
      "responsable": "supervisores",
      "objective": "tener un control de densidades mas riguroso a la hora de trabajar con esta formula\n_ poner en funcionamiento silo chico de acopio de recupero que permita controlar el barro previo a batea\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\n_ aumentar cantidades de agua / aluminio a formula 57 en el momento de su uso",
      "dateExp": "",
      "dateFin": ""
    },
    {
      "responsable": "supervisores",
      "objective": "Generar un procedimieno de inicio de colado post parada de planta",
      "dateExp": "",
      "dateFin": ""
    },
    {
      "responsable": "supervisores",
      "objective": "generar un regimen de limpieza semanal de bateas de acopio",
      "dateExp": "",
      "dateFin": ""
    },
    {
      "responsable": "supervisores",
      "objective": "comprar repuestos para reparacion de bombas neumaticas",
      "dateExp": "",
      "dateFin": ""
    }
  ],
  "impact": null,
  "evidencia": "",
  "learning": ""
}
,
  {
    "id": 12, "num": 12, "date": "2024-10-10",
    "problem": "No enciende la caldera",
    "responsable": "Matías Muzaber", "area": "Mantenimiento",
    "integrantes": "Andrés Reynoso · Raúl Caballero",
    "status": "closed",
    "causes": {
      "maquinaria": ["Electroválvula de gas bloqueada","Sensor de llama sin señal"],
      "mano": [], "medio": [],
      "materiales": [],
      "metodos": ["Sin checklist de arranque de caldera"],
      "otros": []
    },
    "whys": [
      {"cause": "Electroválvula de gas bloqueada",
       "answers": ["Acumulación de residuos en asiento de válvula","Sin limpieza periódica","No incluida en plan de MP","No identificada como componente crítico",""]}
    ],
    "actions": [
      {"responsable":"Matías Muzaber","objective":"Limpiar electroválvula e incorporar al plan de MP semestral","dateExp":"","dateFin":""},
      {"responsable":"Matías Muzaber","objective":"Crear checklist de arranque de caldera","dateExp":"","dateFin":""}
    ],
    "impact": "positive",
    "evidencia": "Sin falla de encendido en los 4 meses siguientes",
    "learning": "Electroválvula en plan de MP semestral y checklist de arranque implementado"
  }];
  // Fix dates and normalize
  REAL_OCCS.forEach(o => {
    if (!o.id) o.id = o.num;
    if (!o.causes) o.causes = {maquinaria:[],mano:[],medio:[],materiales:[],metodos:[],otros:[]};
    if (!o.whys) o.whys = [];
    if (!o.actions) o.actions = [];
  });
  saveOCCs(REAL_OCCS);
  return REAL_OCCS;
}

// ═══════════════════════════════════════════════════════
// HASH (simple, client-side — for demo)
// ═══════════════════════════════════════════════════════
async function hashPass(p){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ═══════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════
function renderAuth(){
  const tab = LS.get('authTab') || 'login';
  const tl = t();
  const isLogin = tab==='login';
  document.getElementById('root').innerHTML = `
  <div class="auth-wrap">

    <!-- LEFT — brand panel -->
    <div class="auth-left">
      <div class="auth-left-bg"></div>
      <div class="auth-left-grid"></div>
      <div class="auth-left-ghost">Raíz</div>

      <div class="auth-brand-top">
        <div class="auth-brand-dot"></div>
        <span>RAÍZ&nbsp;/&nbsp;${APP.lang==='es'?'ANÁLISIS DE CAUSA RAÍZ':'ROOT CAUSE ANALYSIS'}</span>
      </div>

      <div class="auth-hero">
        <div class="auth-hero-word">Ra<span>í</span>z</div>
        <div class="auth-tagline">
          ${APP.lang==='es'
            ? 'Sistema de inteligencia para el análisis de causa raíz en manufactura.'
            : 'Root cause intelligence for manufacturing operations.'}
        </div>
      </div>

      <div class="auth-left-footer">
        ${APP.lang==='es'
          ? 'Acceso exclusivo para equipos autorizados'
          : 'Exclusive access for authorized teams'}
      </div>
    </div>

    <!-- RIGHT — form panel -->
    <div class="auth-right">
      <div class="auth-right-top">
        <div class="lang-sw">
          <button class="${APP.lang==='es'?'active':''}" onclick="APP.lang='es';LS.set('lang','es');renderAuth()">ES</button>
          <button class="${APP.lang==='en'?'active':''}" onclick="APP.lang='en';LS.set('lang','en');renderAuth()">EN</button>
        </div>
      </div>

      <div class="auth-box">
        <div id="pwa-install-banner" class="install-banner" style="display:none" onclick="installPWA()">
          <span class="ib-icon">📲</span>
          <div><strong>Instalar Raíz en tu dispositivo</strong><span>Funciona offline · Como app nativa</span></div>
        </div>

        <div class="auth-box-title">${isLogin
          ? (APP.lang==='es'?'Bienvenido':'Welcome back')
          : (APP.lang==='es'?'Crear cuenta':'Create account')}</div>
        <div class="auth-box-sub">${isLogin
          ? (APP.lang==='es'?'Ingresá con tus credenciales para continuar.':'Sign in with your credentials to continue.')
          : (APP.lang==='es'?'Registrate para acceder al sistema.':'Register to access the system.')}</div>

        <div class="auth-tabs">
          <button class="auth-tab ${tab==='login'?'active':''}" onclick="LS.set('authTab','login');renderAuth()">${tl.login}</button>
          <button class="auth-tab ${tab==='register'?'active':''}" onclick="LS.set('authTab','register');renderAuth()">${tl.register}</button>
        </div>
        <div id="auth-err" class="auth-err"></div>

        ${isLogin ? `
          <form id="login-form" onsubmit="event.preventDefault();doLogin()" action="#" method="post">
          <div class="field"><label>${tl.email}</label>
            <input type="email" id="f-email" name="email" placeholder="usuario@empresa.com"
              autocomplete="username email" value="${LS.get('lastEmail')||''}"></div>
          <div class="field">
            <label>${tl.password}</label>
            <input type="password" id="f-pass" name="password" placeholder="••••••••" autocomplete="current-password">
          </div>
          <button type="submit" class="btn-primary">${tl.login}</button>
          </form>
          <p style="text-align:center;margin-top:16px;font-size:12px;color:var(--text2)">
            ${APP.lang==='es'?'¿No tenés cuenta?':'No account?'}
            <span style="color:var(--accent);cursor:pointer;font-weight:600" onclick="LS.set('authTab','register');renderAuth()">
              ${tl.register}
            </span>
          </p>
        ` : `
          <form id="register-form" onsubmit="event.preventDefault();doRegister()" action="#" method="post">
          <div class="field"><label>${tl.name}</label><input type="text" id="f-name" name="name" autocomplete="name" placeholder="Nombre completo"></div>
          <div class="field"><label>${tl.email}</label><input type="email" id="f-email" name="email" autocomplete="username email" placeholder="usuario@empresa.com"></div>
          <div class="field"><label>${tl.password}</label><input type="password" id="f-pass" name="password" autocomplete="new-password" placeholder="••••••••"></div>
          <div class="field"><label>${tl.area}</label>
            <select id="f-area">${tl.areas.map(a=>`<option>${a}</option>`).join('')}</select>
          </div>
          <div class="field"><label>${tl.company}</label><input type="text" id="f-company" placeholder="Mi Empresa S.A." value="" oninput="updateTenantHint(this.form)"></div>
          <div id="tenant-hint" style="font-size:12px;color:var(--text3);font-family:var(--fm);margin:-8px 0 14px;padding:10px 12px;background:var(--surface2);border-radius:8px;border-left:3px solid var(--accent);line-height:1.5">
            Si tu empresa ya usa Raíz, un administrador tiene que aprobar tu cuenta antes de que puedas entrar.
          </div>
          <button type="submit" class="btn-primary">${tl.register}</button>
          </form>
          <p style="text-align:center;margin-top:16px;font-size:12px;color:var(--text2)">
            ${APP.lang==='es'?'¿Ya tenés cuenta?':'Already have an account?'}
            <span style="color:var(--accent);cursor:pointer;font-weight:600" onclick="LS.set('authTab','login');renderAuth()">
              ${tl.login}
            </span>
          </p>
        `}
      </div>
    </div>

  </div>`;
  // Enter key
  setTimeout(()=>{
    // Auto-focus: if email is pre-filled, go straight to password
    if(tab==='login'){
      const emailEl = document.getElementById('f-email');
      const passEl  = document.getElementById('f-pass');
      if(emailEl && passEl){
        if(emailEl.value.trim()) passEl.focus();
        else emailEl.focus();
      }
    }
  },80);
}

async function saveBrowserCredential(email, password, name){
  try{
    if(window.PasswordCredential && navigator.credentials && navigator.credentials.store){
      await navigator.credentials.store(new PasswordCredential({id:email, password, name:name||email}));
    }
  }catch(e){}
}

async function doLogin(){
  const email = document.getElementById('f-email')?.value.trim();
  const pass = document.getElementById('f-pass')?.value;
  if(!email||!pass){showAuthErr(t().fillFields);return;}
  const btn = document.querySelector('.btn-primary');
  if(btn){ btn.textContent = 'Ingresando...'; btn.disabled = true; }
  try {
    const j = await api('login', { email, password: pass });
    await saveBrowserCredential(email, pass, j.user && j.user.name);
    LS.set('token', j.token);
    LS.set('lastEmail', email);
    APP.user = j.user; APP._tenant = j.tenant;
    APP.lang = LS.get('lang') || 'es';
    await loadTenantData();
    initApp();
  } catch(e) {
    showAuthErr(e.code==='network' ? 'Error de conexión. Verificá tu internet.' : e.message);
    console.error(e);
  } finally {
    if(btn){ btn.textContent = t().login; btn.disabled = false; }
  }
}

async function doRegister(){
  const name = document.getElementById('f-name')?.value.trim();
  const email = document.getElementById('f-email')?.value.trim();
  const pass = document.getElementById('f-pass')?.value;
  const area = document.getElementById('f-area')?.value;
  const company = document.getElementById('f-company')?.value.trim() || '';
  if(!name||!email||!pass){showAuthErr(t().fillFields);return;}
  const btn = document.querySelector('.btn-primary');
  if(btn){ btn.textContent = 'Registrando...'; btn.disabled = true; }
  try {
    const j = await api('register', { name, email, password: pass, area, company });
    if(j.pending){
      LS.set('authTab','login'); LS.set('lastEmail', email); renderAuth();
      setTimeout(()=>{ const el=document.getElementById('auth-err'); if(el){ el.style.display='block'; el.style.color='var(--accent)'; el.style.borderColor='rgba(0,184,148,.3)'; el.style.background='rgba(0,184,148,.08)'; el.textContent=j.message; } }, 50);
      return;
    }
    await saveBrowserCredential(email, pass, name);
    LS.set('token', j.token);
    APP.user = j.user; APP._tenant = j.tenant;
    APP.lang = LS.get('lang') || 'es';
    await loadTenantData();
    initApp();
  } catch(e) {
    showAuthErr(e.code==='network' ? 'Error al registrar. Verificá tu conexión.' : e.message);
    console.error('doRegister error:', e);
  } finally {
    if(btn){ btn.textContent = t().register; btn.disabled = false; }
  }
}

function updateTenantHint(form){
  // called on company input change — could also wire to email
}

function showAuthErr(msg){
  const el = document.getElementById('auth-err');
  if(el){el.style.display='block';el.textContent=msg;}
}

// ═══════════════════════════════════════════════════════
// APP INIT
// ═══════════════════════════════════════════════════════
function initApp(){
  APP.view = 'dashboard';
  renderApp();
  generateAlertNotifs();
}

function renderApp(){
  const tl = t();
  const occs = getOCCs();
  const today = new Date();
  const overdueCount = occs.filter(o=>o.status!=='closed'&&o.actions.some(a=>a.dateExp&&!a.dateFin&&new Date(a.dateExp)<today)).length;
  const notifs = getNotifs();
  const unread = notifs.filter(n=>!n.read).length;

  const navItems = [
    {id:'dashboard',icon:'◈',label:tl.dashboard},
    {id:'occ',icon:'⊞',label:tl.occ},
    {id:'insights',icon:'◎',label:tl.insights},
    {id:'users',icon:'◉',label:tl.users},
    {id:'notifications',icon:'◷',label:tl.notifications,badge:unread||null},
  ];

  document.getElementById('root').innerHTML = `
  <div class="app-wrap">
    <aside class="sidebar">
      <div class="sb-logo">
        <div class="sb-logo-row">
          <div class="sb-mark">R</div>
          <div>
            <div class="sb-title">Raíz</div>
            <div class="sb-ver">Root Cause Intelligence</div>
          </div>
          <div style="margin-left:auto">
            <div class="lang-sw">
              <button class="${APP.lang==='es'?'active':''}" onclick="APP.lang='es';LS.set('lang','es');renderApp()">ES</button>
              <button class="${APP.lang==='en'?'active':''}" onclick="APP.lang='en';LS.set('lang','en');renderApp()">EN</button>
            </div>
          </div>
        </div>
      </div>
      <div class="sb-user">
        <div style="display:flex;align-items:center;gap:9px">
          <div style="width:32px;height:32px;border-radius:50%;background:${APP.user.color};display:flex;align-items:center;justify-content:center;font-family:var(--fh);font-weight:800;font-size:13px;color:#000;flex-shrink:0">${APP.user.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="sb-user-name">${APP.user.name}</div>
            <div class="sb-user-role"><span class="role-badge ${APP.user.role}">${APP.user.role}</span> · ${APP.user.area}</div>
          </div>
        </div>
      </div>
      <nav class="sb-nav">
        <div class="sb-section">Menú</div>
        ${navItems.map(n=>`
        <button class="sb-item ${APP.view===n.id?'active':''}" onclick="setView('${n.id}')">
          <span class="icon">${n.icon}</span>${n.label}
          ${n.badge?`<span class="sb-badge">${n.badge}</span>`:''}
        </button>`).join('')}
      </nav>
      <div class="sb-bottom">
        <button class="theme-toggle" onclick="toggleTheme()" title="${APP.lang==='es'?'Cambiar tema':'Toggle theme'}">
          <span id="theme-icon" style="font-size:16px;line-height:1">${APP.theme==='dark'?'🌙':'☀️'}</span>
          <span class="theme-toggle-label" id="theme-label">${APP.theme==='dark'?(APP.lang==='es'?'Modo oscuro':'Dark mode'):(APP.lang==='es'?'Modo claro':'Light mode')}</span>
          <div class="theme-toggle-track"><div class="theme-toggle-thumb"></div></div>
        </button>
        <button class="sb-item" onclick="exportBackup()" style="color:var(--text2);font-size:12px" title="${APP.lang==='es'?'Exportar copia de seguridad':'Export backup'}">
          <span class="icon">⬇</span>${APP.lang==='es'?'Exportar datos':'Export data'}
        </button>
        <label class="sb-item" style="color:var(--text2);font-size:12px;cursor:pointer" title="${APP.lang==='es'?'Importar copia de seguridad':'Import backup'}">
          <span class="icon">⬆</span>${APP.lang==='es'?'Importar datos':'Import data'}
          <input type="file" accept=".json" style="display:none" onchange="importBackup(event)">
        </label>
        <button class="sb-item" onclick="doLogout()" style="color:var(--red)">
          <span class="icon">⇥</span>${tl.logout}
        </button>
      </div>
    </aside>
    <div class="main-area">
      <header class="topbar">
        <!-- LEFT: hamburger (mobile) + back + title -->
        <div class="topbar-left">
          <button class="sb-toggle" onclick="toggleSidebar()" aria-label="Menú">☰</button>
          <button id="topbar-back" onclick="goBack()" style="display:none;align-items:center;gap:4px;background:none;border:none;cursor:pointer;color:var(--text2);font-size:13px;font-family:var(--fb);padding:5px 8px 5px 4px;border-radius:7px;transition:all .15s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span id="topbar-back-lbl" style="font-size:13px">Atrás</span>
          </button>
          <div class="topbar-title" id="topbar-title">${tl[APP.view]||'Raíz'}</div>
        </div>
        <!-- CENTER: global search -->
        <div class="topbar-center">
          <input class="topbar-search" id="topbar-search" type="text"
            placeholder="Buscar OCC por número, problema o responsable..."
            oninput="globalSearch(this.value)"
            onblur="setTimeout(()=>closeGlobalSearch(),150)"
            autocomplete="off">
          <div class="topbar-search-results" id="topbar-search-results"></div>
        </div>
        <!-- RIGHT: notif + new occ -->
        <div class="topbar-right">
          <div style="position:relative">
            <button class="notif-btn" onclick="toggleNotif()">🔔${unread>0?`<span class="notif-dot"></span>`:''}</button>
          </div>
          <button class="btn-new-occ" onclick="startWizard()">＋ ${tl.newOCC}</button>
        </div>
      </header>
      <div class="content" id="content"></div>
    </div>
  </div>`;

  renderNotifPanel();
  renderContent();
  updateThemeToggleUI();
  updateTopbar();
}

function setView(v, pushHistory=true){
  if(pushHistory && APP.view !== v) APP.navHistory.push(APP.view);
  if(APP.navHistory.length > 10) APP.navHistory.shift();
  APP.view = v;
  document.querySelectorAll('.sb-item').forEach(el=>{
    el.classList.toggle('active', el.getAttribute('onclick')===`setView('${v}')`);
  });
  updateTopbar();
  renderContent();
}

function toggleSidebar(){
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sb-overlay');
  if(!sb||!ov) return;
  const isOpen = sb.classList.contains('open');
  sb.classList.toggle('open', !isOpen);
  ov.classList.toggle('open', !isOpen);
}

function renderBottomNav(){
  const nav = document.getElementById('bottom-nav');
  if(!nav) return;
  const tl = t();
  const views = [
    {v:'dashboard', icon:'⊞', label:'Inicio'},
    {v:'occ',       icon:'⊙', label:'OCC'},
    {v:'insights',  icon:'◈', label:'Análisis'},
    {v:'notifications', icon:'🔔', label:'Alertas'},
  ];
  nav.innerHTML = views.map(item=>`
    <button class="bn-item${APP.view===item.v?' active':''}" onclick="setView('${item.v}')">
      <span class="bn-icon" style="font-size:18px">${item.icon}</span>
      <span>${item.label}</span>
    </button>`).join('') +
    `<button class="bn-item" onclick="startWizard()" style="color:var(--accent)">
      <span style="font-size:20px;font-weight:700">＋</span>
      <span>Nueva</span>
    </button>`;
}

function goBack(){
  const prev = APP.navHistory.pop();
  if(prev) setView(prev, false);
  else setView('dashboard', false);
}

function updateTopbar(){
  const tl = t();
  const titleEl = document.getElementById('topbar-title');
  const backEl  = document.getElementById('topbar-back');
  if(!titleEl) return;
  titleEl.textContent = tl[APP.view]||'Raíz';
  if(backEl){
    const hasPrev = APP.navHistory.length > 0;
    backEl.style.display = hasPrev ? 'flex' : 'none';
    if(hasPrev){
      const prevView = APP.navHistory[APP.navHistory.length-1];
      const backLbl = document.getElementById('topbar-back-lbl');
    if(backLbl) backLbl.textContent = tl[prevView]||prevView;
    backEl.title = 'Volver a ' + (tl[prevView]||prevView);
    }
  }
}

function renderContent(){
  const el = document.getElementById('content');
  if(!el) return;
  if(APP.view==='dashboard'){ el.innerHTML = renderDashboard(); initGreeting(); }
  else if(APP.view==='occ') el.innerHTML = renderOCCList();
  else if(APP.view==='insights') el.innerHTML = renderInsights();
  else if(APP.view==='users') el.innerHTML = renderUsers();
  else if(APP.view==='notifications') el.innerHTML = renderNotifications();
  else if(APP.view==='wizard') {
    el.innerHTML = renderWizard(); el.style.background='var(--bg)'; injectAssistantOverlay(APP.wizardStep); attachAutoResize();
    // Delegado una sola vez: cualquier campo del wizard cuenta como
    // actividad, no solo los 3 que llamaban raUserActivity() a mano.
    // Antes, escribir/pararse en cualquier otro campo no reseteaba el
    // reloj de inactividad y la burbuja aparecía igual.
    if(!el._raActivityBound){
      el._raActivityBound = true;
      el.addEventListener('input', raUserActivity);
      el.addEventListener('focusin', raUserActivity);
    }
  }
  document.body.classList.toggle('wizard-active', APP.view==='wizard');
  updateTopbar();
  renderBottomNav();
  // Inject assistant on all views
  if(APP.view !== 'wizard') {
    // Show context-aware intro when view changes
    raOnViewChange(APP.view);
  }
}

function doLogout(){
  LS.del('session'); LS.del('token');
  APP.user = null;
  APP.view = 'dashboard';
  sessionStorage.removeItem('raiz_greet_done');
  renderAuth();
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════

// ── Auto-resize textareas ──────────────────────────────
function attachAutoResize(){
  document.querySelectorAll('textarea.fi, .pf textarea').forEach(ta=>{
    // set initial height
    ta.style.height='auto';
    ta.style.height = Math.max(ta.scrollHeight, parseInt(ta.style.minHeight||'0')) + 'px';
    if(!ta._raResize){
      ta._raResize = true;
      ta.addEventListener('input', function(){
        this.style.height='auto';
        this.style.height=this.scrollHeight+'px';
      });
    }
  });
}








// ── Global search ──────────────────────────────────────────
function globalSearch(q){
  const box = document.getElementById('topbar-search-results');
  if(!box) return;
  if(!q || q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
  const occs = getOCCs();
  const ql = q.toLowerCase();
  const results = occs.filter(o=>
    String(o.num).includes(q) ||
    o.problem.toLowerCase().includes(ql) ||
    (o.responsable||'').toLowerCase().includes(ql) ||
    (o.area||'').toLowerCase().includes(ql)
  ).slice(0,7);
  if(!results.length){
    box.innerHTML = `<div class="tsr-empty">Sin resultados para "${esc(q)}"</div>`;
  } else {
    const stColors = {open:'var(--orange)',closed:'var(--accent)',analysis:'var(--blue)'};
    box.innerHTML = results.map(o=>`
      <div class="tsr-item" onclick="closeGlobalSearch();openOCCDetail(${o.id})">
        <span class="tsr-num">N° ${o.num}</span>
        <div style="flex:1;min-width:0">
          <div class="tsr-prob">${esc(o.problem.length>60?o.problem.slice(0,59)+'…':o.problem)}</div>
          <div class="tsr-meta">${esc(o.area)} · ${esc(o.responsable)}</div>
        </div>
        <span style="width:8px;height:8px;border-radius:50%;background:${stColors[o.status]||'var(--border2)'};flex-shrink:0"></span>
      </div>`).join('');
  }
  box.classList.add('open');
}

function closeGlobalSearch(){
  const box = document.getElementById('topbar-search-results');
  const inp = document.getElementById('topbar-search');
  if(box){ box.classList.remove('open'); box.innerHTML=''; }
  if(inp) inp.value = '';
}


// ── Greeting: hero entrance once per session ───────────────
function initGreeting(){
  const el = document.getElementById('db-greeting-block');
  if(!el) return;

  if(sessionStorage.getItem('raiz_greet_done')){
    el.classList.add('static');
    return;
  }

  // ── FIRST VISIT: show fullscreen overlay ──────────────────

  const user = APP.user || {};
  const firstName = (user.name||'').split(' ')[0] || 'bienvenido';
  const hour = new Date().getHours();
  const greet = hour<12?'Buenos días':hour<19?'Buenas tardes':'Buenas noches';
  const area = user.area || '';
  const metaTxt = area ? `${area} · Raíz` : 'Raíz';

  const overlay = document.createElement('div');
  overlay.className = 'greet-overlay';
  overlay.id = 'greet-overlay';
  overlay.innerHTML = `
    <div class="greet-overlay-logo">R</div>
    <div style="display:flex;align-items:center;gap:16px">
      <div class="greet-overlay-name">${greet}, ${firstName}</div>
      <div class="greet-overlay-emoji">👋</div>
    </div>
    <div class="greet-overlay-meta">${metaTxt}</div>
    <div class="greet-overlay-hint">Tocá en cualquier lugar para continuar</div>
    <div class="greet-overlay-fab" id="greet-fab-clone">${RA_AVATAR_SVG}</div>
  `;
  document.body.appendChild(overlay);

  // dismiss on click/tap
  const dismissOverlay = () => {
    sessionStorage.setItem('raiz_greet_done','1');
    overlay.classList.add('exit');
    setTimeout(()=>{
      el.classList.add('static');
      // Animate real FAB dropping into place
      const fab = document.getElementById('ra-fab');
      if(fab){
        fab.style.transition = 'none';
        fab.style.transform = 'translateY(-80px) scale(0.5)';
        fab.style.opacity = '0';
        setTimeout(()=>{
          fab.style.transition = 'transform .6s cubic-bezier(.34,1.56,.64,1), opacity .35s ease';
          fab.style.transform = 'translateY(0) scale(1)';
          fab.style.opacity = '1';
        }, 50);
      }
    }, 200);
    setTimeout(()=>overlay.remove(), 520);
    overlay.removeEventListener('click', dismissOverlay);
    document.removeEventListener('keydown', dismissOverlay);
  };

  // allow dismiss after 1.6s (let animations play)
  setTimeout(()=>{
    overlay.addEventListener('click', dismissOverlay);
    document.addEventListener('keydown', dismissOverlay, {once:true});
  }, 1600);
}

function animateFABEntrance(){
  const fab = document.getElementById('ra-fab');
  if(!fab) return;
  fab.classList.add('flying');
  setTimeout(()=>fab.classList.remove('flying'), 800);
}

function renderDashboard(){
  const tl = t();
  const occs = getOCCs();
  const today = new Date();
  const thisMonth = today.toISOString().slice(0,7);
  const lastMonth = new Date(today.getFullYear(), today.getMonth()-1, 1).toISOString().slice(0,7);

  const total   = occs.length;
  const open    = occs.filter(o=>o.status!=='closed').length;
  const closed  = occs.filter(o=>o.status==='closed').length;
  const overdue = occs.filter(o=>o.status!=='closed'&&o.actions.some(a=>a.dateExp&&!a.dateFin&&new Date(a.dateExp)<today)).length;

  // ── Trend vs last month
  const thisM = occs.filter(o=>o.date&&o.date.startsWith(thisMonth)).length;
  const lastM = occs.filter(o=>o.date&&o.date.startsWith(lastMonth)).length;
  const trend = thisM - lastM;
  const trendTag = (val, invert=false) => {
    if(val===0) return `<span class="db-kpi-trend same">→ igual</span>`;
    const up = val > 0;
    const cls = (up !== invert) ? 'up' : 'down';
    return `<span class="db-kpi-trend ${cls}">${up?'↑':'↓'} ${Math.abs(val)} vs mes ant.</span>`;
  };

  // ── This month closed vs last month closed
  const closedThis = occs.filter(o=>o.status==='closed'&&o.date&&o.date.startsWith(thisMonth)).length;
  const closedLast = occs.filter(o=>o.status==='closed'&&o.date&&o.date.startsWith(lastMonth)).length;
  const overdueThis = overdue;
  const overdueLast = occs.filter(o=>o.status!=='closed'&&o.actions.some(a=>{
    if(!a.dateExp||a.dateFin) return false;
    const exp = new Date(a.dateExp);
    return exp < new Date(today.getFullYear(), today.getMonth(), 1);
  })).length;

  // ── My pending actions
  const myActions = [];
  occs.forEach(o=>{
    if(o.status==='closed') return;
    (o.actions||[]).forEach(a=>{
      if(a.responsable===APP.user.name && !a.dateFin){
        const diff = a.dateExp ? Math.ceil((new Date(a.dateExp)-today)/(1000*60*60*24)) : null;
        myActions.push({occ:o.num,occId:o.id,prob:o.problem,text:a.objective||'—',diff});
      }
    });
  });
  myActions.sort((a,b)=>(a.diff??999)-(b.diff??999));

  // ── All alerts (all responsables)
  const alerts=[];
  occs.forEach(o=>{
    if(o.status==='closed') return;
    (o.actions||[]).forEach(a=>{
      if(a.dateExp&&!a.dateFin){
        const diff=Math.ceil((new Date(a.dateExp)-today)/(1000*60*60*24));
        if(diff<0)  alerts.push({type:'urgent',occ:o.num,occId:o.id,prob:o.problem,resp:a.responsable,days:diff});
        else if(diff<=7) alerts.push({type:'warn',occ:o.num,occId:o.id,prob:o.problem,resp:a.responsable,days:diff});
      }
    });
  });

  // ── Recurrences
  const recMap={};
  occs.forEach(o=>{const k=o.problem.toLowerCase().trim();(recMap[k]=recMap[k]||[]).push(o.num);});
  const recur=Object.entries(recMap).filter(([,v])=>v.length>1).sort((a,b)=>b[1].length-a[1].length).slice(0,5);

  // ── Greeting
  const hour = today.getHours();
  const greet = hour<12?'Buenos días':hour<19?'Buenas tardes':'Buenas noches';
  const firstName = APP.user.name.split(' ')[0];
  const dateStr = today.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  const dateCapitalized = dateStr.charAt(0).toUpperCase()+dateStr.slice(1);

  // ── Step labels for OCC progress
  const stepLabels = ['Contexto','Problema','Causas','5 Porqués','Acciones','Seguimiento'];

  return `
  <!-- GREETING -->
  <div class="db-greeting" id="db-greeting-block">
    <div class="db-greeting-name">${greet}, ${firstName} <span class="db-greeting-emoji">👋</span></div>
    <div class="db-greeting-meta">${dateCapitalized} · ${APP.user.area} · ${APP.user.role}</div>
  </div>

  <!-- KPIs -->
  <div class="db-kpi-grid">
    <div class="db-kpi" onclick="setView('occ');setTimeout(()=>filterOCCList(''),80)" style="cursor:pointer" title="Ver todas las OCC">
      <div class="db-kpi-stripe" style="background:var(--orange)"></div>
      <div class="db-kpi-lbl">Total OCC</div>
      <div class="db-kpi-num" style="color:var(--orange)">${total}</div>
      <div class="db-kpi-row">
        <span class="db-kpi-sub">en el sistema</span>
        ${trendTag(trend, false)}
      </div>
    </div>
    <div class="db-kpi" onclick="setView('occ');setTimeout(()=>filterOCCList('__open'),80)" style="cursor:pointer" title="Ver OCC abiertas">
      <div class="db-kpi-stripe" style="background:var(--blue)"></div>
      <div class="db-kpi-lbl">Abiertas</div>
      <div class="db-kpi-num" style="color:var(--blue)">${open}</div>
      <div class="db-kpi-row">
        <span class="db-kpi-sub">en proceso</span>
        ${trendTag(open - (lastM > 0 ? lastM : open), true)}
      </div>
    </div>
    <div class="db-kpi" onclick="setView('occ');setTimeout(()=>filterOCCList('venc'),80)" style="cursor:pointer" title="Ver OCC con acciones vencidas">
      <div class="db-kpi-stripe" style="background:${overdue>0?'var(--red)':'var(--accent)'}"></div>
      <div class="db-kpi-lbl">Vencidas</div>
      <div class="db-kpi-num" style="color:${overdue>0?'var(--red)':'var(--accent)'}">${overdue}</div>
      <div class="db-kpi-row">
        <span class="db-kpi-sub">acciones</span>
        ${overdue===0?`<span class="db-kpi-trend up">✓ Al día</span>`:trendTag(overdue-overdueLast, true)}
      </div>
    </div>
    <div class="db-kpi" onclick="setView('insights')" style="cursor:pointer" title="Ver análisis de impacto">
      <div class="db-kpi-stripe" style="background:var(--accent)"></div>
      <div class="db-kpi-lbl">Resueltas</div>
      <div class="db-kpi-num" style="color:var(--accent)">${closed}</div>
      <div class="db-kpi-row">
        <span class="db-kpi-sub">causas eliminadas</span>
        ${trendTag(closedThis - closedLast, false)}
      </div>
    </div>
  </div>

  <!-- MIS ACCIONES -->
  ${myActions.length>0?`
  <div class="db-my-card">
    <div class="db-my-hd">
      <div class="db-my-title">⚡ Mis acciones pendientes</div>
      <span class="db-my-badge">${myActions.length} acción${myActions.length>1?'es':''}</span>
    </div>
    ${myActions.slice(0,4).map(a=>{
      const cls = a.diff===null?'ok':a.diff<0?'overdue':a.diff<=3?'overdue':a.diff<=7?'soon':'ok';
      const lbl = a.diff===null?'Sin fecha':a.diff<0?`Vencida hace ${Math.abs(a.diff)}d`:a.diff===0?'Vence hoy':`Vence en ${a.diff}d`;
      return `<div class="db-action-row" onclick="openOCCDetail(${a.occId})" style="cursor:pointer">
        <div>
          <div class="db-action-occ">OCC N° ${a.occ}</div>
          <div class="db-action-text">${a.text.length>55?a.text.slice(0,54)+'…':a.text}</div>
        </div>
        <div class="db-action-resp">${a.prob.length>24?a.prob.slice(0,23)+'…':a.prob}</div>
        <span class="db-action-badge ${cls}">${lbl}</span>
      </div>`;
    }).join('')}
    ${myActions.length>4?`<div style="font-size:11px;color:var(--text3);text-align:center;padding-top:10px;font-family:var(--fm)">+${myActions.length-4} más → revisá en OCC</div>`:''}
  </div>`:''}

  <!-- ALERTAS + REINCIDENCIAS -->
  <div class="db-bottom-grid">
    <div class="db-alert-card ${alerts.length===0?'ok':''}">
      <div class="db-card-hd">
        <span class="db-card-hd-icon">${alerts.length===0?'✅':'🚨'}</span>
        <span class="db-card-hd-title">Alertas de vencimiento</span>
        ${alerts.length>0?`<span class="db-card-hd-count">${alerts.length}</span>`:`<span class="db-card-hd-count ok">0</span>`}
      </div>
      ${alerts.length===0
        ?`<div style="font-size:13px;color:var(--accent)">Todas las acciones están al día.</div>`
        :alerts.slice(0,4).map(a=>`
        <div class="db-alert-row" onclick="openOCCDetail(${a.occId})" style="cursor:pointer">
          <div class="db-alert-dot" style="background:${a.type==='urgent'?'var(--red)':'var(--orange)'}"></div>
          <div class="db-alert-body">
            <div class="db-alert-prob">OCC N° ${a.occ} — ${a.prob.length>32?a.prob.slice(0,31)+'…':a.prob}</div>
            <div class="db-alert-meta">${a.resp} · ${a.days<0?`hace ${Math.abs(a.days)}d`:`en ${a.days}d`}</div>
          </div>
          <span class="db-alert-chip ${a.type}">${a.type==='urgent'?'Vencida':'Próxima'}</span>
        </div>`).join('')}
    </div>

    <div class="db-alert-card ok" style="border-color:rgba(0,184,148,.15);background:var(--surface)">
      <div class="db-card-hd">
        <span class="db-card-hd-icon">🔁</span>
        <span class="db-card-hd-title">Reincidencias detectadas</span>
        <span class="db-card-hd-count ok">${recur.length}</span>
      </div>
      ${recur.length===0
        ?`<div style="font-size:13px;color:var(--accent)">Sin problemas reincidentes.</div>`
        :recur.map(([k,nums])=>`
        <div class="db-recur-row" onclick="setView('occ');setTimeout(()=>filterOCCList('${k.slice(0,30)}'),80)" style="cursor:pointer;border-radius:6px;transition:background .15s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
          <div class="db-recur-label" title="${k}">${k.charAt(0).toUpperCase()+k.slice(1,42)}${k.length>42?'…':''}</div>
          <span class="db-recur-pill">⟳ ${nums.length}× · N° ${nums.slice(-2).join(', N°')}</span>
        </div>`).join('')}
    </div>
  </div>

  <!-- TRABADAS + APRENDIZAJES -->
  <div class="db-bottom-grid">
    ${renderStalledCard(occs)}
    ${renderLearningsCard(occs)}
  </div>

  <!-- OCC RECIENTES — compact -->
  <div class="db-recent-card">
    <div class="db-recent-hd">
      <div class="db-recent-title">OCC recientes</div>
      <span class="db-recent-link" onclick="setView('occ')">Ver todas →</span>
    </div>
    ${occs.slice(-4).reverse().map(o=>{
      const stMap={open:'Pendiente',closed:'Cerrada',analysis:'En análisis'};
      const step = occStateLabel(o)[1];
      const isOpen = o.status!=='closed';
      return `<div class="db-recent-row" onclick="openOCCDetail(${o.id})">
        <span class="db-recent-num">N° ${o.num}</span>
        <div style="min-width:0">
          <div class="db-recent-prob">${esc(o.problem.length>52?o.problem.slice(0,51)+'…':o.problem)}</div>
          <div class="db-recent-resp">${esc(o.date)} · ${esc(o.responsable)}</div>
        </div>
        <span class="db-recent-step ${isOpen?'open-step':''}">${step}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// ═══════════════════════════════════════════════════════
// OCC LIST
// ═══════════════════════════════════════════════════════
function renderOCCList(){
  const tl = t();
  const occs = getOCCs();
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">
    <div style="font-family:var(--fh);font-size:17px;font-weight:700">OCC <span style="color:var(--text2);font-size:14px;font-weight:400">(${occs.length})</span></div>
    <div class="search-bar">
      <span style="color:var(--text3)">🔍</span>
      <input placeholder="${tl.colProblem}, ${tl.colResp}..." oninput="filterOCCList(this.value)" id="occ-search">
    </div>
  </div>
  <div class="card" id="occ-table-wrap">${renderTable(occs)}</div>`;
}

function filterOCCList(q, ftype='prob'){
  const occs = getOCCs();
  const today = new Date();
  let f;
  if(ftype === 'month' && q){
    f = occs.filter(o=>o.date&&o.date.startsWith(q));
    const searchEl = document.getElementById('occ-search');
    const[y,mo]=q.split('-'); const mn=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const mName=(mn[parseInt(mo,10)-1]||mo)+"'"+y.slice(2);
    if(searchEl){searchEl.value='';searchEl.placeholder=`📅 OCC de ${mName} — borrá para ver todas`;}
  } else if(q === 'venc'){
    f = occs.filter(o=>o.status!=='closed'&&o.actions.some(a=>a.dateExp&&!a.dateFin&&new Date(a.dateExp)<today));
    const searchEl = document.getElementById('occ-search');
    if(searchEl){ searchEl.value = ''; searchEl.placeholder = '⚠️ Mostrando OCC con acciones vencidas — borrá para ver todas'; }
  } else if(q === '__open'){
    f = occs.filter(o=>o.status!=='closed');
    const searchEl = document.getElementById('occ-search');
    if(searchEl){ searchEl.value = ''; searchEl.placeholder = '🔵 Mostrando OCC abiertas — borrá para ver todas'; }
  } else if(q === '__closed'){
    f = occs.filter(o=>o.status==='closed');
    const searchEl = document.getElementById('occ-search');
    if(searchEl){ searchEl.value = ''; searchEl.placeholder = '✅ Mostrando OCC cerradas — borrá para ver todas'; }
  } else if(q === '__closed_positive'){
    f = occs.filter(o=>o.status==='closed'&&o.impact==='positive');
    const searchEl = document.getElementById('occ-search');
    if(searchEl){ searchEl.value = ''; searchEl.placeholder = '✅ Causa raíz eliminada — borrá para ver todas'; }
  } else if(q === '__closed_partial'){
    f = occs.filter(o=>o.status==='closed'&&o.impact==='partial');
    const searchEl = document.getElementById('occ-search');
    if(searchEl){ searchEl.value = ''; searchEl.placeholder = '🔶 Mejora parcial — borrá para ver todas'; }
  } else if(q) {
    const ql = q.toLowerCase();
    if(ftype === 'area'){
      f = occs.filter(o=>(o.area||'').toLowerCase().includes(ql));
    } else if(ftype === 'resp'){
      f = occs.filter(o=>o.status!=='closed'&&(o.responsable||'').toLowerCase().includes(ql));
    } else if(ftype === 'causa'){
      f = occs.filter(o=>(o.whys||[]).some(w=>(w.cause||'').toLowerCase().includes(ql)));
    } else {
      // prob — search problem text
      f = occs.filter(o=>o.problem.toLowerCase().includes(ql)||o.responsable.toLowerCase().includes(ql)||String(o.num).includes(q));
    }
    const searchEl = document.getElementById('occ-search');
    const ftypeLabel = ftype==='area'?'área':ftype==='resp'?'responsable':ftype==='causa'?'causa raíz':'problema';
    if(searchEl){ searchEl.value=''; searchEl.placeholder=`🔍 Filtrando por ${ftypeLabel}: "${q}" — borrá para ver todas`; }
  } else {
    f = occs;
    const searchEl = document.getElementById('occ-search');
    if(searchEl) searchEl.placeholder = 'Problema, Responsable...';
  }
  const el = document.getElementById('occ-table-wrap');
  if(el) el.innerHTML = renderTable(f);
}

function renderTable(occs){
  const tl = t();
  if(!occs.length) return `<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">${tl.totalOCC===0?'Sin OCC':t().totalOCC}</div></div>`;
  const stMap={open:tl.stOpen,closed:tl.stClosed,analysis:tl.stAnalysis};
  const stCls={open:'open',closed:'closed',analysis:'analysis'};
  const allOCCs = getOCCs();
  return `<table class="tbl">
    <thead><tr>
      <th>${tl.colDate}</th><th>${tl.colNum}</th><th>${tl.colProblem}</th>
      <th>${tl.colResp}</th><th>${tl.colStatus}</th><th>${tl.colRecur}</th>
    </tr></thead>
    <tbody>
    ${occs.map(o=>{
      const sim=allOCCs.filter(x=>x.id!==o.id&&similarity(x.problem,o.problem)>0.4);
      return `<tr onclick="openOCCDetail(${o.id})" style="font-size:14px">
        <td style="color:var(--text2);font-family:var(--fm);font-size:11px">${o.date}</td>
        <td class="occ-num">N° ${o.num}</td>
        <td style="max-width:280px">${esc(o.problem)}</td>
        <td style="color:var(--text2);font-size:12px">${esc(o.responsable)}</td>
        <td>${(()=>{const s=occStateLabel(o);return '<span class="pill '+s[0]+'">'+s[1]+'</span>';})()}</td>
        <td>${sim.length>0?`<span class="recur-badge">⟳ ${sim.length+1}x</span>`:'<span style="color:var(--text3);font-size:12px">—</span>'}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
}

// ═══════════════════════════════════════════════════════
// INSIGHTS
// ═══════════════════════════════════════════════════════
// ── PARETO CHART ENGINE ──────────────────────────────────
// ═══════════════════════════════════════════════════════
// INSIGHTS — modern horizontal bar chart engine
// ═══════════════════════════════════════════════════════
function barChartClick(el){
  const label = decodeURIComponent(el.getAttribute('data-filter')||'');
  const ftype = el.getAttribute('data-ftype')||'prob';
  if(!label) return;
  setView('occ');
  setTimeout(()=>filterOCCList(label, ftype), 80);
}

function renderBarChart(items, color, filterType='prob') {
  if(!items.length) return `<p style="color:var(--text3);font-size:13px;padding:8px 0">Sin datos suficientes.</p>`;
  const total = items.reduce((s,i)=>s+i.value,0);
  let cum = 0;
  const max = items[0].value;
  const withCum = items.map(it => {
    cum += it.value;
    return { ...it, pct: Math.round(it.value/total*100), cumPct: Math.round(cum/total*100) };
  });
  // Position of 80% cumulative mark on the bar track
  const pct80item = withCum.find(it => it.cumPct >= 80);
  // How wide (%) should the 80% line be on the track?
  // It falls at the right edge of the bar whose cumPct first hits 80
  const idx80 = pct80item ? withCum.indexOf(pct80item) : -1;
  // 80% line position as fraction of the widest bar (always 100%)
  // We draw it at pct80item.value / max * 100 width
  const line80W = pct80item ? Math.round(pct80item.value / max * 100) : -1;

  return `<div class="ins-bar-chart">
    ${withCum.map((it, i) => {
      const fillW = Math.max(2, Math.round(it.value / max * 100));
      const inPareto = it.cumPct <= 80;
      const alpha = inPareto ? '1' : '0.38';
      return `
      <div class="ins-bar-row" data-filter="${encodeURIComponent(it.label.slice(0,30))}" data-ftype="${filterType}" onclick="barChartClick(this)" title="Ver OCC: ${esc(it.label)}">
        <div class="ins-bar-label" title="${esc(it.label)}">${esc(it.label.length > 18 ? it.label.slice(0,17)+'…' : it.label)}</div>
        <div class="ins-bar-track">
          <div class="ins-bar-fill" style="width:${fillW}%;background:${color};opacity:${alpha}">
            <span class="ins-bar-fill-val">${it.value}</span>
          </div>
          ${i === idx80 ? `<div class="ins-bar-80" style="left:${fillW}%"></div>` : ''}
        </div>
        <div class="ins-bar-pct" style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
          <span>${it.pct}%</span>
          <span style="font-size:9px;color:var(--text3);opacity:0" class="ins-bar-arrow">→</span>
        </div>
      </div>`;
    }).join('')}
    <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);font-family:var(--fm)">
        <span style="width:12px;height:12px;background:${color};border-radius:3px;display:inline-block"></span>Frecuencia
      </span>
      <span style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);font-family:var(--fm)">
        <span style="width:2px;height:12px;background:rgba(224,62,62,.6);display:inline-block"></span>Umbral 80%
      </span>
      <span style="margin-left:auto;font-size:11px;color:var(--text3);font-family:var(--fm)">n = ${total}</span>
    </div>
  </div>`;
}

// Keep renderPareto as alias for any code that still calls it
function renderPareto(items, id, color='#00b894') {
  return renderBarChart(items, color);
}

function insToggle(id) {
  const el = document.getElementById('ins-acc-' + id);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  // Close all
  document.querySelectorAll('.ins-acc-item').forEach(e => e.classList.remove('open'));
  if (!isOpen) el.classList.add('open');
}

function renderInsights(){
  const tl = t();
  const occs = getOCCs();
  const closed = occs.filter(o=>o.status==='closed');
  const impacts={positive:0,partial:0,negative:0,unknown:0};
  closed.forEach(o=>{if(o.impact)impacts[o.impact]=(impacts[o.impact]||0)+1;});

  // ── Pareto 1: Problemas
  const probMap={};
  occs.forEach(o=>{
    const k = o.problem.toLowerCase().replace(/[^a-záéíóúüñ\s]/gi,' ').replace(/\s+/g,' ').trim().slice(0,40);
    probMap[k]=(probMap[k]||{count:0,label:o.problem});
    probMap[k].count++;
  });
  const paretoProbs = Object.values(probMap).sort((a,b)=>b.count-a.count).slice(0,10)
    .map(p=>({label:p.label.slice(0,32), value:p.count}));

  // ── Pareto 2: Área
  const areaMap={};
  occs.forEach(o=>{areaMap[o.area]=(areaMap[o.area]||0)+1;});
  const paretoArea = Object.entries(areaMap).sort((a,b)=>b[1]-a[1])
    .map(([k,v])=>({label:k,value:v}));

  // ── Pareto 3: Causas raíz
  const causaMap={};
  occs.forEach(o=>{(o.whys||[]).forEach(w=>{
    if(!w.cause)return;
    const k=w.cause.toLowerCase().replace(/[^a-záéíóúüñ\s]/gi,' ').replace(/\s+/g,' ').trim().slice(0,35);
    causaMap[k]=(causaMap[k]||{count:0,label:w.cause}); causaMap[k].count++;
  });});
  const paretoCausas = Object.values(causaMap).sort((a,b)=>b.count-a.count).slice(0,8)
    .map(c=>({label:c.label.slice(0,32), value:c.count}));

  // ── Pareto 4: Responsables
  const respMap={};
  occs.filter(o=>o.status!=='closed').forEach(o=>{respMap[o.responsable]=(respMap[o.responsable]||0)+1;});
  const paretoResp = Object.entries(respMap).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([k,v])=>({label:k.split(' ').slice(-1)[0], value:v}));

  // ── Evolución mensual
  const monthly={};
  occs.forEach(o=>{if(o.date&&/^\d{4}-\d{2}/.test(o.date)){const m=o.date.slice(0,7);monthly[m]=(monthly[m]||0)+1;}});
  const sortedMonths=Object.entries(monthly).sort((a,b)=>a[0].localeCompare(b[0]));
  const maxM=Math.max(...sortedMonths.map(([,v])=>v),1);

  const resolRate = occs.length ? Math.round(closed.length/occs.length*100) : 0;
  const openCount = occs.filter(o=>o.status!=='closed').length;
  const resolColor = resolRate>=70?'var(--accent)':resolRate>=40?'var(--orange)':'var(--red)';

  // ── KPI strip
  const kpis = `
  <div class="ins-kpi-strip">
    <div class="ins-kpi-card" onclick="setView('occ');setTimeout(()=>filterOCCList('__closed_positive'),80)" title="Ver OCC con impacto positivo">
      <div class="ins-kpi-bar" style="background:var(--accent)"></div>
      <div class="ins-kpi-lbl">Causa eliminada</div>
      <div class="ins-kpi-num" style="color:var(--accent)">${impacts.positive}</div>
      <div class="ins-kpi-desc">impacto positivo</div>
    </div>
    <div class="ins-kpi-card" onclick="setView('occ');setTimeout(()=>filterOCCList('__closed_partial'),80)" title="Ver OCC con mejora parcial">
      <div class="ins-kpi-bar" style="background:var(--orange)"></div>
      <div class="ins-kpi-lbl">Mejora parcial</div>
      <div class="ins-kpi-num" style="color:var(--orange)">${impacts.partial}</div>
      <div class="ins-kpi-desc">causa reducida</div>
    </div>
    <div class="ins-kpi-card" onclick="setView('occ');setTimeout(()=>filterOCCList('__open'),80)" title="Ver OCC abiertas">
      <div class="ins-kpi-bar" style="background:var(--blue)"></div>
      <div class="ins-kpi-lbl">OCC abiertas</div>
      <div class="ins-kpi-num" style="color:var(--blue)">${openCount}</div>
      <div class="ins-kpi-desc">en proceso</div>
    </div>
    <div class="ins-kpi-card" onclick="setView('occ');setTimeout(()=>filterOCCList('__closed'),80)" title="Ver OCC cerradas">
      <div class="ins-kpi-bar" style="background:${resolColor}"></div>
      <div class="ins-kpi-lbl">Resolución</div>
      <div class="ins-kpi-num" style="color:${resolColor}">${resolRate}%</div>
      <div class="ins-kpi-desc">${closed.length} / ${occs.length} cerradas</div>
    </div>
  </div>`;

  // ── Accordion builder
  function acc(id, color, title, meta, statVal, statLbl, chartHtml, startOpen=false) {
    return `
    <div class="ins-acc-item${startOpen?' open':''}" id="ins-acc-${id}">
      <button class="ins-acc-trigger" onclick="insToggle('${id}')">
        <div class="ins-acc-color" style="background:${color}"></div>
        <div class="ins-acc-info">
          <div class="ins-acc-title">${title}</div>
          <div class="ins-acc-meta">${meta}</div>
        </div>
        <div class="ins-acc-stats">
          <div class="ins-acc-stat">
            <div class="ins-acc-stat-val" style="color:${color}">${statVal}</div>
            <div class="ins-acc-stat-lbl">${statLbl}</div>
          </div>
        </div>
        <span class="ins-acc-chevron">▾</span>
      </button>
      <div class="ins-acc-body">
        <div class="ins-acc-inner">${chartHtml}</div>
      </div>
    </div>`;
  }

  // Monthly sparkline chart
  const sparkHtml = `
  <div style="display:flex;align-items:flex-end;gap:0">
    <div class="ins-spark">
      ${sortedMonths.map(([m,v])=>`
      <div class="ins-spark-col" onclick="setView('occ');setTimeout(()=>filterOCCList('${m}','month'),80)" style="cursor:pointer;border-radius:6px;padding:2px" title="Ver OCC de ${m}">
        <div class="ins-spark-val">${v}</div>
        <div class="ins-spark-bar" style="height:${Math.max(8,Math.round(v/maxM*180))}px"></div>
        <div class="ins-spark-lbl">${(()=>{const parts=m.split('-');const y=parts[0]||'';const mo=parts[1]||'';const mn=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];const idx=parseInt(mo,10)-1;return (idx>=0&&idx<12?mn[idx]:mo)+"'"+(y.length>=4?y.slice(2):'??');})()}</div>
      </div>`).join('')}
    </div>
  </div>`;

  return kpis + `
  <div class="ins-accordion">
    ${acc('probs','#00b894',
      'Problemas por frecuencia',
      '¿Cuáles concentran el 80% de las OCC?',
      paretoProbs[0]?.label.slice(0,18)||'—', 'más frecuente',
      renderBarChart(paretoProbs,'#00b894','prob'), true)}
    ${acc('area','#3b82f6',
      'OCC por área',
      '¿Dónde se originan más problemas en la planta?',
      paretoArea[0]?.label.slice(0,14)||'—', 'área líder',
      renderBarChart(paretoArea,'#3b82f6','area'))}
    ${acc('resp','#a78bfa',
      'Carga por responsable',
      'OCC abiertas sin cerrar — ¿quién tiene más pendiente?',
      paretoResp[0]?.label.slice(0,14)||'—', 'más carga',
      renderBarChart(paretoResp,'#a78bfa','resp'))}
    ${acc('causas','#f87171',
      'Causas raíz recurrentes',
      '¿Qué causas aparecen en múltiples análisis de 5 Porqués?',
      paretoCausas.length, 'causas únicas',
      renderBarChart(paretoCausas,'#f87171','causa'))}
    ${acc('monthly','#00b894',
      'Evolución mensual',
      'OCC registradas por mes — tendencia histórica',
      sortedMonths.length, 'meses con datos',
      sparkHtml)}
  </div>`;
}

// ═══════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════
async function changeUserRole(id, role){
  try{
    const j = await api('user.setRole', {id, role});
    APP._users = (APP._users||[]).map(u=>u.id===id?Object.assign({},u,j.user):u);
    toast(role==='pendiente'?'Cuenta suspendida':'Rol actualizado: '+role,'success');
    renderContent();
  }catch(e){ toast(e.message,'error'); renderContent(); }
}

function renderUsers(){
  const tl = t();
  const users = getUsers();
  const occs = getOCCs();
  if(!users.length) return `<div class="empty"><div class="empty-icon">👥</div><div class="empty-title">${tl.usersTitle}</div><p style="color:var(--text2);font-size:13px">Registrá el primer usuario.</p></div>`;
  return `
  <div style="font-family:var(--fh);font-size:17px;font-weight:700;margin-bottom:18px">${tl.usersTitle} <span style="color:var(--text2);font-size:14px;font-weight:400">(${users.length})</span></div>
  ${APP.user.role==='admin' && users.some(u=>u.role==='pendiente') ? `<div class="why-guide"><strong>${users.filter(u=>u.role==='pendiente').length} cuenta(s) esperando aprobación.</strong> Elegí el rol en la tarjeta de cada persona para darle acceso.</div>` : ''}
  <div class="user-grid">
    ${users.map(u=>{
      const myOCCs=occs.filter(o=>o.responsable===u.name);
      const resolved=myOCCs.filter(o=>o.status==='closed').length;
      return `<div class="user-card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div class="user-av" style="background:${u.color};color:#000">${esc(u.name.charAt(0).toUpperCase())}</div>
          <div>
            <div class="user-name">${esc(u.name)}</div>
            <div class="user-email">${esc(u.email)}</div>
            ${APP.user.role==='admin' && u.id!==APP.user.id
              ? `<select class="fi" style="font-size:12px;padding:5px 8px;margin-top:4px;max-width:150px" onchange="changeUserRole('${u.id}',this.value)">
                  ${['pendiente','operario','supervisor','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${r==='pendiente'?'Pendiente de aprobación':r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}
                </select>`
              : `<span class="role-badge ${u.role}">${u.role==='pendiente'?'pendiente':u.role}</span>`}
          </div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px">${esc(u.area)} · ${esc(u.company||'Retak')}</div>
        <div class="user-stats">
          <div class="user-stat"><div class="user-stat-val" style="color:var(--accent)">${myOCCs.length}</div><div class="user-stat-lbl">${tl.occByUser}</div></div>
          <div class="user-stat"><div class="user-stat-val" style="color:var(--green)">${resolved}</div><div class="user-stat-lbl">${tl.resolvedByUser}</div></div>
        </div>
        ${u.id===APP.user.id?`<div style="margin-top:8px;font-size:11px;color:var(--accent);font-family:var(--fm)">← vos</div>`:''}
      </div>`;
    }).join('')}
  </div>`;
}

// ═══════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════
function notifClick(el){
  if(!el) return;
  const notifId  = el.getAttribute('data-notif-id');
  const occId    = el.getAttribute('data-occ-id');
  const filterTx = el.getAttribute('data-filter');
  // Mark as read
  const notifs = getNotifs().map(x=>String(x.id)===String(notifId)?{...x,read:true}:x);
  saveNotifs(notifs);
  if(occId && occId!==''){
    setView('occ');
    setTimeout(()=>openOCCDetail(Number(occId)), 80);
  } else {
    // Fallback: extract OCC number from title text (e.g. "Acción vencida — OCC N° 21")
    const titleEl = el.querySelector('strong');
    const titleTxt = titleEl ? titleEl.textContent : '';
    const match = titleTxt.match(/N[°º]\s*(\d+)/);
    if(match){
      const occNum = parseInt(match[1]);
      const occs = getOCCs();
      const found = occs.find(o=>o.num===occNum);
      if(found){ setView('occ'); setTimeout(()=>openOCCDetail(found.id), 80); return; }
    }
    // Reincidencia or other: filter by text
    if(filterTx && filterTx!==''){
      setView('occ');
      setTimeout(()=>filterOCCList(filterTx,'prob'), 80);
    } else {
      // Last resort: extract quoted text from body for reincidencia
      const bodyEl = el.querySelector('span');
      const bodyTxt = bodyEl ? bodyEl.textContent : '';
      const qMatch = bodyTxt.match(/"([^"]+)"/);
      if(qMatch){ setView('occ'); setTimeout(()=>filterOCCList(qMatch[1].slice(0,30),'prob'), 80); }
    }
  }
}

function renderNotifications(){
  const tl = t();
  const notifs = getNotifs();
  if(!notifs.length) return `<div class="empty"><div class="empty-icon">🔔</div><div class="empty-title">${tl.noNotifs}</div></div>`;
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
    <div style="font-family:var(--fh);font-size:17px;font-weight:700">${tl.notifTitle}</div>
    <button class="btn-sec" onclick="clearNotifs()">${tl.clearAll}</button>
  </div>
  <div class="card">
    ${notifs.slice().reverse().map(n=>`
    <div class="alert-item ${n.type}" data-notif-id="${n.id}" data-occ-id="${n.occId||''}" data-filter="${n.filterText||''}" onclick="notifClick(this)" style="cursor:pointer;border-radius:10px;transition:background .15s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <span style="font-size:16px">${n.icon}</span>
      <div class="ai-text" style="flex:1">
        <strong>${esc(n.title)}</strong>
        <span>${esc(n.body)}</span>
        <div class="notif-time">${n.time} · <span style="color:var(--accent);font-size:10px">→ Ver OCC</span></div>
      </div>
      ${!n.read?`<div style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:5px"></div>`:''}
    </div>`).join('')}
  </div>`;
}

function renderNotifPanel(){
  const tl = t();
  const notifs = getNotifs();
  const panel = document.getElementById('notif-panel');
  if(!panel) return;
  panel.innerHTML = `
  <div class="notif-hd">${tl.notifTitle}<span class="notif-clear" onclick="clearNotifs()">${tl.clearAll}</span></div>
  ${notifs.length===0?`<div class="notif-empty">${tl.noNotifs}</div>`:
    notifs.slice().reverse().slice(0,8).map(n=>`
    <div class="notif-item ${n.read?'':'unread'}">
      <div class="notif-title">${n.icon} ${esc(n.title)}</div>
      <div class="notif-body">${esc(n.body)}</div>
      <div class="notif-time">${n.time}</div>
    </div>`).join('')}`;
}

function toggleNotif(){
  APP.notifOpen = !APP.notifOpen;
  const panel = document.getElementById('notif-panel');
  if(panel) panel.style.display = APP.notifOpen ? 'block' : 'none';
  if(APP.notifOpen){
    // mark all read
    const notifs = getNotifs().map(n=>({...n,read:true}));
    saveNotifs(notifs);
    renderApp();
    setTimeout(()=>{const p=document.getElementById('notif-panel');if(p)p.style.display='block';},50);
  }
}

function clearNotifs(){
  saveNotifs([]);
  APP.notifOpen=false;
  renderApp();
}

function generateAlertNotifs(){
  const occs = getOCCs();
  const today = new Date();
  const existing = getNotifs();
  const newNotifs = [];

  occs.forEach(o=>{
    if(o.status==='closed') return;
    o.actions.forEach((a,i)=>{
      if(!a.dateExp||a.dateFin) return;
      const diff = Math.ceil((new Date(a.dateExp)-today)/(1000*60*60*24));
      const key = `occ-${o.id}-action-${i}`;
      if(existing.find(n=>n.key===key)) return;
      if(diff<0){
        newNotifs.push({id:Date.now()+Math.random(),key,type:'urgent',icon:'🚨',title:`Acción vencida — OCC N° ${o.num}`,body:`${a.objetivo||a.objective} · Responsable: ${a.responsable}`,time:formatDate(new Date()),read:false,occId:o.id,occNums:[o.num]});
        simEmail(a.responsable, `Acción vencida en OCC N° ${o.num}`, `La acción "${a.objetivo||a.objective}" venció hace ${Math.abs(diff)} días.`);
      } else if(diff<=5){
        newNotifs.push({id:Date.now()+Math.random(),key,type:'warn',icon:'⚠️',title:`Acción por vencer — OCC N° ${o.num}`,body:`${a.objetivo||a.objective} · Vence en ${diff} días · ${a.responsable}`,time:formatDate(new Date()),read:false,occId:o.id,occNums:[o.num]});
        if(diff===3||diff===1) simEmail(a.responsable, `Acción vence en ${diff} días — OCC N° ${o.num}`, `Recordatorio: "${a.objetivo||a.objective}" vence el ${a.dateExp}.`);
      }
    });
  });

  // Reincidencia
  const reincMap={};
  occs.forEach(o=>{const k=o.problem.toLowerCase().trim();reincMap[k]=(reincMap[k]||[]);reincMap[k].push(o.num);});
  Object.entries(reincMap).filter(([,v])=>v.length>1).forEach(([k,nums])=>{
    const key=`reinc-${k.slice(0,20)}`;
    if(!existing.find(n=>n.key===key)){
      newNotifs.push({id:Date.now()+Math.random(),key,type:'warn',icon:'🔁',title:`Reincidencia detectada`,body:`"${k.charAt(0).toUpperCase()+k.slice(1)}" aparece ${nums.length} veces (OCC N° ${nums.join(', N°')})`,time:formatDate(new Date()),read:false,occNums:nums,filterText:k.slice(0,30)});
    }
  });

  // OCC trabadas (una vez por semana por OCC)
  const _wk=Math.floor(Date.now()/604800000);
  occs.forEach(o=>{const s=occStalled(o);if(!s)return;const key='stall-'+o.id+'-'+_wk;if(existing.find(n=>n.key===key))return;
    newNotifs.push({id:Date.now()+Math.random(),key,type:'warn',icon:'⏸',title:'OCC trabada — N° '+o.num,body:o.problem+' · '+s.txt,time:formatDate(new Date()),read:false,occId:o.id,occNums:[o.num]});});

  if(newNotifs.length){
    saveNotifs([...existing,...newNotifs]);
  }
}

function simEmail(to, subject, body){
  const notifs = getNotifs();
  notifs.push({
    id:Date.now()+Math.random(),key:'email-'+Date.now(),type:'info',icon:'📧',
    title:`Email simulado → ${to}`,
    body:`Asunto: ${subject} | ${body}`,
    time:formatDate(new Date()),read:false
  });
  saveNotifs(notifs);
}

// ═══════════════════════════════════════════════════════
// WIZARD
// ═══════════════════════════════════════════════════════
function startWizard(){
  // ── START WIZARD ───────────────────────────────────────
  APP.wizardStep = 0;
  APP._ctxWarnOverride = false;
  APP.wizardData.ishiSuggestions = null;
  APP.wizardData.ishiSugLoading = false;
  APP.wizardData.ishiSuggestions = null;
  APP.wizardData = {
    problem:'',responsable:APP.user.name,area:APP.user.area,
    date:new Date().toISOString().split('T')[0],
    ishiSuggestions: null,  // {maquinaria:[...], mano:[...], ...} — loaded once per wizard
    ishiSugLoading: false,
    ctx:{
      objeto:'', condActual:'', condEsperada:'',
      deteccion:[],
      cantidad:'', cantidadNA:false, cantidadJust:'',
      impactoTiempo:'', impactoTiempoNA:false, impactoTiempoJust:'',
      reincidencia:'',
      turnosNo:'', turnosNoNA:false, turnosNoJust:'',
      areasNo:'', areasNoNA:false, areasNoJust:'',
      contencion:'', demora:'',
    },
    ctxAiStatus:'', ctxAiMsg:'', ctxAiFindings:[],
    probDraft:'', probDraftStatus:'idle',
    que:'',donde:'',cuando:'',cuantas:'',bajo:'',queNo:'',
    causes:{maquinaria:['','',''],mano:['','',''],medio:['','',''],materiales:['','',''],metodos:['','',''],otros:['','','']},
    selectedCauses:[], causeVerif:{}, ishiDescarte:'',
    whys:[],
    actions:[{responsable:APP.user.name,objective:'',ataca:'',dateExp:'',dateFin:''}],
    seg:{indicador:'',meta:'',n:3,fecha:''},
    impact:null,evidencia:'',learning:''
  };
  if(APP.view!=='wizard') APP.navHistory.push(APP.view);
  APP.view='wizard';
  setView('wizard');
  setTimeout(raStartIdleWatch, 500);
}

function showUpgradeModal(){}
function closeUpgradeModal(){}

function renderWizard(){
  const tl = t();
  const steps = tl.steps;
  const s = APP.wizardStep;
  raOnStepChange(s);
  let content='';
  const _stepMeta=[
    {title:'Contexto del evento',sub:'Datos reales y observables. La IA los usará para validar que el problema esté bien definido.'},
    {title:'Formulación del problema',sub:'El motor de validación verifica que la formulación sea un hecho observable, sin causas ni soluciones, coherente con el contexto registrado.'},
    {title:'Diagrama de Ishikawa',sub:'Listá causas posibles por categoría y seleccioná las que analizarás con 5 Porqués.'},
    {title:'5 Porqués',sub:'Cada porqué con evidencia de planta, hasta llegar a la decisión, regla o plan que faltaba.'},
    {title:'Plan de acción',sub:'Cada acción es una hipótesis con responsable, fecha y métrica esperada.'},
    {title:'Seguimiento',sub:'Qué se va a medir para confirmar que la causa se eliminó. La OCC se cierra después, con las mediciones.'},
  ];
  const _sm=_stepMeta[s]||{};
  const _hdr=_sm.title?`<div class="wiz-header"><div class="wiz-step-title">${_sm.title}</div><div class="wiz-step-sub">${_sm.sub}</div></div>`:'';
  if(s===0) content=_hdr+renderWStep0();
  else if(s===1){
    content=_hdr+renderWStepProblem();
    // Auto-generate draft on first entry if no problem written yet
    const _d = APP.wizardData;
    if(!_d.problem && (_d.probDraftStatus==='idle'||!_d.probDraftStatus) && _d.probDraftStatus!=='loading'){
      _d.probDraftStatus = 'loading'; // set immediately to prevent double-trigger
      setTimeout(generateProbDraft, 80);
    }
  }
  else if(s===2){
    content=_hdr+renderWStep1();
    setTimeout(loadIshiSuggestions, 80);
  }
  else if(s===3) content=_hdr+renderWStep2();
  else if(s===4) content=_hdr+renderWStep3();
  else if(s===5) content=_hdr+renderWStep4();

  return `
  <div class="wiz-wrap">

    <div class="wiz-steps">
      ${steps.map((st,i)=>`
      <div class="ws ${i===s?'active':i<s?'done':'future'}">
        <div class="ws-num">${i<s?'✓':i+1}</div>
        <div class="ws-lbl">${st}</div>
      </div>`).join('')}
    </div>
    ${content}
    <div class="wiz-nav">
      <button class="btn-back" onclick="${s===0?"setView('occ')":' wizPrev()'}">${s===0?'✕ '+tl.cancel:tl.back}</button>
      <button class="btn-next" onclick="wizNext()">${s===5?tl.close:tl.next}</button>
    </div>
  </div>
`;
}


const RA_AVATAR_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block"><defs><style>@keyframes ra-blink{0%,88%,100%{transform:scaleY(1)}94%{transform:scaleY(0.07)}}@keyframes ra-look{0%,35%,100%{transform:translate(0,0)}45%{transform:translate(2.5px,-1px)}65%{transform:translate(-2px,1.5px)}80%{transform:translate(1px,-1.5px)}}@keyframes ra-breathe-face{0%,100%{transform:scale(1)}50%{transform:scale(1.042)}}.raf{transform-origin:50px 50px;animation:ra-breathe-face 3s ease-in-out infinite}.rael{transform-origin:33px 52px;animation:ra-blink 4.5s ease-in-out infinite}.raer{transform-origin:67px 52px;animation:ra-blink 4.5s ease-in-out 0.08s infinite}.rap{animation:ra-look 7s ease-in-out infinite}</style></defs><g class="raf"><text x="50" y="72" text-anchor="middle" font-family="Syne,sans-serif" font-size="52" font-weight="800" fill="#fff" opacity="0.11">R</text><g class="rael"><ellipse cx="33" cy="52" rx="11" ry="13" fill="#fff"/></g><g class="raer"><ellipse cx="67" cy="52" rx="11" ry="13" fill="#fff"/></g><g class="rap"><circle cx="33" cy="54" r="6.5" fill="#003d2e"/><circle cx="67" cy="54" r="6.5" fill="#003d2e"/><circle cx="35.5" cy="51.5" r="2.2" fill="#fff"/><circle cx="69.5" cy="51.5" r="2.2" fill="#fff"/></g><rect x="22" y="35" width="20" height="3.5" rx="1.75" fill="#fff" opacity="0.8"/><rect x="58" y="35" width="20" height="3.5" rx="1.75" fill="#fff" opacity="0.8"/><path d="M38 66 Q50 74 62 66" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/></g></svg>';

// Inject FAB + assistant panel into a fixed overlay outside the render cycle
// ═══════════════════════════════════════════════════════════
// RAÍZ ASSISTANT — state
// ═══════════════════════════════════════════════════════════
const RA = {
  messages: [],
  listening: false,
  loading: false,
  lastStep: -1,
  open: false,        // starts closed — FAB only
  _breatheTimer: null,
  _msgId: 0,
};

const RA_STEP_INTROS = {
  0: `<strong>Contexto del evento</strong><br>Describí qué pasó, cuánto impactó y cómo se detectó. Cuanto más preciso seas acá, mejor será el análisis de causa raíz. <em>Podés preguntarme cualquier duda sobre los campos.</em>`,
  1: `<strong>Formulación del problema</strong><br>El problema debe describir un <strong>hecho observable</strong> — no una causa ni una solución. Por ejemplo: <em>"Ladrillo fuera de tolerancia de compresión en línea 2"</em>. ¿Querés que revise tu formulación?`,
  2: `<strong>Diagrama de Ishikawa</strong><br>Exploramos hipótesis de causa en las 6M. No es necesario llenar todas las categorías — solo las que aplican. Los chips verdes son sugerencias de la IA basadas en el contexto que cargaste.`,
  3: `<strong>5 Porqués</strong><br>Para cada causa seleccionada, preguntamos "¿por qué?" hasta llegar a la causa raíz. Necesitás mínimo 3 niveles. Evitá respuestas circulares como <em>"porque no funciona"</em>. ¿Empezamos?`,
  4: `<strong>Plan de acción</strong><br>Definí acciones concretas para eliminar la causa raíz — no el síntoma. Cada acción necesita responsable y fecha. ¿Necesitás ayuda para redactar alguna?`,
  5: `<strong>Seguimiento</strong><br>Definí qué vas a medir y qué valor confirma que la causa se eliminó. La OCC no se cierra acá: va a revisión y se cierra con mediciones.`,
};

const RA_SUGGESTIONS = {
  0: ['¿Qué pongo en condición esperada?', '¿Cómo completo "Áreas sin problema"?', '¿Qué es reincidencia?'],
  1: ['¿Cómo redacto bien el problema?', '¿Por qué no puedo poner la causa?', 'Revisá mi formulación'],
  2: ['¿Cómo uso el Ishikawa?', '¿Cuántas causas pongo?', '¿Qué es Medio ambiente?'],
  3: ['¿Cuántos porqués necesito?', '¿Cómo evito el razonamiento circular?', 'Explicame los 5 porqués'],
  4: ['¿Qué diferencia hay entre acción y solución?', '¿Pongo una o varias acciones?'],
  5: ['¿Cómo evalúo si la acción funcionó?', '¿Qué evidencia sirve?', '¿Qué pongo en aprendizaje?'],
};

// ── View-level intros & suggestions (for non-wizard views) ───
const RA_VIEW_INTROS = {
  dashboard: `<strong>Panel de inicio</strong><br>Acá vas a ver el estado general de la planta: OCC abiertas, alertas de vencimiento y reincidencias. ¿Querés que te explique algún indicador?`,
  occ:       `<strong>Lista de OCC</strong><br>Este es el repositorio de todas las Oportunidades de Causa y Corrección registradas. Podés buscar, filtrar y abrir cualquiera para ver su detalle. ¿Necesitás ayuda para encontrar algo?`,
  insights:  `<strong>Módulo de Análisis</strong><br>Acá vas a encontrar los gráficos de Pareto, reincidencias y tendencia mensual. Hacé clic en cualquier barra para filtrar las OCC de esa categoría. ¿Querés que te explique algún gráfico?`,
  users:     `<strong>Usuarios</strong><br>Desde acá podés ver y gestionar los usuarios registrados en la planta. ¿Tenés alguna pregunta?`,
  notifications: `<strong>Notificaciones</strong><br>Estas son las alertas automáticas de acciones vencidas y reincidencias. Hacé clic en cualquier notificación para ir directo a esa OCC.`,
};
const RA_VIEW_SUGGESTIONS = {
  dashboard:     ['¿Qué significa "vencida"?', '¿Cómo creo una OCC?', '¿Qué es una reincidencia?'],
  occ:           ['¿Cómo busco una OCC?', '¿Qué significa cada estado?', '¿Cómo cierro una OCC?'],
  insights:      ['¿Qué es el gráfico de Pareto?', '¿Cómo interpreto el 80%?', '¿Qué son las causas raíz?'],
  users:         ['¿Qué roles existen?', '¿Cómo agrego un usuario?'],
  notifications: ['¿Cuándo se generan alertas?', '¿Qué es una acción vencida?'],
};

function injectAssistantOverlay(step) {
  let root = document.getElementById('ra-overlay-root');
  if(!root){ root = document.createElement('div'); root.id='ra-overlay-root'; document.body.appendChild(root); }
  const stepLabels = ['Contexto','Formulación','Ishikawa','5 Porqués','Acciones','Seguimiento'];
  const isWizard = APP.view === 'wizard';
  const isOpen = RA.open !== false;
  // Badge label: wizard step or view name
  const viewLabels = {dashboard:'Inicio',occ:'OCC',insights:'Análisis',users:'Usuarios',notifications:'Alertas'};
  const badgeLabel = isWizard ? (stepLabels[step]||'Paso '+(step+1)) : (viewLabels[APP.view]||'Raíz');
  const sugg = isWizard ? (RA_SUGGESTIONS[step]||[]) : (RA_VIEW_SUGGESTIONS[APP.view]||[]);
  root.innerHTML = `
  <button class="ra-fab${!isOpen?' breathing':''}" id="ra-fab" onclick="raToggle()" title="Asistente Raíz" style="padding:0;overflow:hidden;">
    <div class="ra-fab-ring"></div>
    ${isOpen?'<span style=\'font-size:22px;line-height:1;color:#fff\'>✕</span>':RA_AVATAR_SVG}
  </button>
  <div class="raiz-assistant${RA.listening?' listening':''}${isOpen?'':' ra-hidden'}" id="raiz-assistant">
    <div class="ra-header">
      <div class="ra-avatar${RA.listening?' breathing':''}" id="ra-avatar">
        <div class="ra-avatar-ring"></div>
        ${RA_AVATAR_SVG}
      </div>
      <div class="ra-info">
        <div class="ra-name">Asistente Raíz</div>
        <div class="ra-status" id="ra-status">${RA.loading?'escribiendo...':RA.listening?'escuchando...':'en línea'}</div>
      </div>
      <div class="ra-step-badge">${badgeLabel}</div>
      <button class="ra-close-btn" onclick="raToggle()">✕</button>
    </div>
    <div class="ra-messages" id="ra-messages">
      ${RA.messages.map(m=>m.role==='typing'
        ?`<div class="ra-msg"><div class="ra-msg-avatar">✦</div><div class="ra-msg-bubble"><div class="ra-typing-bubble"><span></span><span></span><span></span></div></div></div>`
        :m.role==='assistant'
          ?`<div class="ra-msg"><div class="ra-msg-avatar">✦</div><div class="ra-msg-bubble ${m.highlight?'highlight':''}">${m.text}</div></div>`
          :`<div class="ra-msg user"><div class="ra-msg-bubble">${m.text}</div></div>`
      ).join('')}
    </div>
    ${sugg.length&&!RA.loading?`<div class="ra-suggestions" id="ra-suggestions">${sugg.map((s,i)=>`<button class="ra-suggestion" onclick="raAsk(${i})">${s}</button>`).join('')}</div>`:''}
    <div class="ra-input-wrap">
      <textarea class="ra-input" id="ra-input" rows="1" placeholder="Preguntá algo sobre este paso..."
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();raSend()}"
        oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
      <button class="ra-send" id="ra-send-btn" onclick="raSend()" ${RA.loading?'disabled':''}>↑</button>
    </div>
  </div>`;
  // Scroll messages to bottom
  const msgs = document.getElementById('ra-messages');
  if(msgs) setTimeout(()=>msgs.scrollTop=msgs.scrollHeight,30);
}



function raToggle() {
  RA.open = RA.open === false ? true : false;
  const step = APP.view === 'wizard' ? APP.wizardStep : 0;
  injectAssistantOverlay(step);
}

// Called when navigating to a non-wizard view
function raOnViewChange(view) {
  if(RA.lastView === view) {
    // Same view — just re-inject without clearing messages
    injectAssistantOverlay(0);
    return;
  }
  RA.lastView = view;
  RA.messages = [];
  RA.open = false; // start closed on view change
  const intro = RA_VIEW_INTROS[view];
  if(intro) RA.messages.push({role:'assistant', text:intro, highlight:true, id:++RA._msgId});
  injectAssistantOverlay(0);
  raStartIdleWatch();
}

// Called when wizard step changes
function raOnStepChange(step) {
  if(RA.lastStep === step) return;
  RA.lastStep = step;
  RA.messages = [];
  RA.open = false; // nunca abrir automáticamente — solo cuando el usuario lo llama
  // push intro, then inject
  RA.messages.push({role:'assistant', text:RA_STEP_INTROS[step]||'¿En qué te puedo ayudar?', highlight:true, id:++RA._msgId});
  setTimeout(()=>injectAssistantOverlay(step), 60);
}

function raAddMessage(role, text, highlight=false) {
  RA.messages.push({role, text, highlight, id: ++RA._msgId});
  injectAssistantOverlay(APP.wizardStep);
}

function updateAssistantDOM() {
  injectAssistantOverlay(APP.wizardStep);
}

// Quick suggestion buttons
function raAsk(idx) {
  const sugg = APP.view==='wizard' ? (RA_SUGGESTIONS[APP.wizardStep]||[]) : (RA_VIEW_SUGGESTIONS[APP.view]||[]);
  const q = sugg[idx];
  if(!q) return;
  raSendText(q);
}

function raSend() {
  const input = document.getElementById('ra-input');
  if(!input || !input.value.trim() || RA.loading) return;
  const text = input.value.trim();
  input.value = '';
  input.style.height = 'auto';
  raSendText(text);
}

async function raSendText(text) {
  raAddMessage('user', text);
  RA.loading = true;
  RA.messages.push({role:'typing', id:++RA._msgId});
  updateAssistantDOM();

  let resp = await raAIResponse(text);
  if(!resp){
    await new Promise(r => setTimeout(r, 500));
    resp = (APP.view!=='wizard' && raViewResponse(text)) || raLocalResponse(text);
  }
  RA.messages = RA.messages.filter(m => m.role !== 'typing');
  RA.loading = false;
  raAddMessage('assistant', resp);
}

// ── Respuesta con IA (por el intermediario); si falla, se usan las respuestas propias ──
async function raAIResponse(q){
  const viewNames = {dashboard:'Inicio',occ:'Lista de OCC',insights:'Análisis',users:'Usuarios',notifications:'Notificaciones',wizard:'Formulario de nueva OCC'};
  const stepNames = ['Contexto','Problema','Causas (Ishikawa)','5 Porqués','Acciones','Seguimiento'];
  const d = APP.wizardData||{}; const c = d.ctx||{};
  const where = APP.view==='wizard' ? 'Formulario de nueva OCC, paso '+(APP.wizardStep+1)+' de 6: '+stepNames[APP.wizardStep] : (viewNames[APP.view]||APP.view);
  const occ = APP.view==='wizard' ? [
    c.objeto && 'Objeto: '+c.objeto, c.condActual && 'Condición actual: '+c.condActual, d.problem && 'Problema: '+d.problem,
    (d.whys||[]).length && 'Cadenas de porqués: '+d.whys.map(w=>w.cause+' -> '+(w.levels||[]).map(l=>l.text).join(' -> ')).join(' | ')
  ].filter(Boolean).join('\n') : '';
  const occs = getOCCs(); const abiertas = occs.filter(o=>o.status!=='closed').length;
  const hist = RA.messages.filter(m=>m.role==='user'||m.role==='assistant').slice(-6,-1)
    .map(m=>(m.role==='user'?'Usuario: ':'Asistente: ')+String(m.text).replace(/<[^>]+>/g,'')).join('\n');
  const prompt = 'Sos el asistente de Raíz, una app de análisis de causa raíz (OCC: Oportunidad, Causa, Contramedida) para plantas industriales. '+
    'Ayudás a supervisores y operarios a razonar, no hacés el análisis por ellos: si te piden la causa, devolvé preguntas o hipótesis para verificar en planta. '+
    'Método de la app: contexto con datos medidos y contención; Ishikawa con causas verificadas con un dato; 5 porqués con evidencia hasta llegar a una causa de gestión (una decisión, regla, plan, estándar o control que faltaba); acciones que atacan cada causa; revisión del supervisor; cierre con mediciones seguidas que cumplen la meta. '+
    'Respondé en español rioplatense, en 2 a 5 oraciones, sin títulos ni listas largas. Si la pregunta no tiene que ver con la app o con el análisis de problemas, decilo en una oración.\n\n'+
    'Pantalla actual: '+where+'\nUsuario: '+(APP.user?.name||'')+' ('+(APP.user?.role||'')+')\nOCC en el sistema: '+occs.length+', abiertas: '+abiertas+'\n'+
    (occ?'Datos de la OCC en curso:\n'+occ+'\n':'')+(hist?'\nConversación previa:\n'+hist+'\n':'')+'\nPregunta: '+q;
  try{
    const txt = await Promise.race([callClaude(prompt, 400), new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),15000))]);
    if(!txt || !String(txt).trim()) return null;
    return esc(String(txt).trim()).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\n+/g,'<br>');
  }catch(e){ return null; }
}

// ── Respuestas propias para las pantallas fuera del formulario ──
function raViewResponse(q){
  const s = normTxt(q); const has = (...w) => w.some(x => s.includes(x));
  if(has('vencid')) return 'Una acción está <strong>vencida</strong> cuando pasó su fecha esperada y todavía no se marcó como hecha. En el inicio las ves en "Alertas de vencimiento"; tocando una abrís la OCC y podés marcarla como hecha o hablar con el responsable.';
  if(has('reincid')) return 'Una <strong>reincidencia</strong> es un problema que ya tuvo otra OCC. Si vuelve a aparecer, la causa raíz de la vez anterior no se eliminó o no era la correcta: conviene abrir la OCC vieja y revisar qué se hizo.';
  if(has('como creo','crear','nueva occ','cargo una')) return 'Tocá <strong>Nueva OCC</strong> arriba a la derecha. El formulario tiene seis pasos: contexto, problema, causas, porqués, acciones y seguimiento. Al final se guarda y pasa a revisión de tu supervisor.';
  if(has('trabad')) return 'Una OCC queda <strong>trabada</strong> si lleva más de 14 días sin movimiento, más de 3 días esperando revisión, o si sus acciones no tienen fecha. Es la señal para preguntar qué la está frenando.';
  if(has('estado','pendiente','en revision','seguimiento','devuelta')) return '<strong>En revisión:</strong> espera que un supervisor la apruebe. <strong>Devuelta:</strong> hay que corregir lo que pidió. <strong>En seguimiento:</strong> aprobada, se van cargando mediciones. <strong>Cerrada:</strong> se verificó el resultado y se estandarizó.';
  if(has('cierro','cerrar')) return 'Una OCC se cierra cuando el supervisor aprobó el análisis y se cargaron las mediciones seguidas que cumplen la meta. Desde el detalle de la OCC, el supervisor toca <strong>Cerrar OCC</strong> y escribe qué se estandariza.';
  if(has('pareto','80')) return 'El <strong>Pareto</strong> ordena los problemas de mayor a menor frecuencia. La línea del 80% marca el grupo chico de problemas que explica la mayor parte de las OCC: atacando esos primero se gana más.';
  if(has('causas raiz','causa raiz')) return 'En Análisis, "Causas raíz recurrentes" junta las causas que aparecieron en varias OCC. Si una causa se repite, la contramedida anterior no alcanzó.';
  if(has('rol','agrego','usuario','aprob')) return 'Hay tres roles: <strong>operario</strong> carga y corrige OCC, <strong>supervisor</strong> además las aprueba y cierra, y <strong>admin</strong> además maneja usuarios. Las cuentas nuevas quedan pendientes hasta que un admin les asigna un rol en Usuarios.';
  if(has('alerta','notific')) return 'Las alertas salen solas: acciones vencidas o por vencer, reincidencias y OCC trabadas. Tocando una vas directo a la OCC.';
  return null;
}

// ── Smart local response engine ──────────────────────────────
function raLocalResponse(q) {
  const d = APP.wizardData;
  const c = d.ctx || {};
  const step = APP.wizardStep;
  const ql = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

  const has = (...words) => words.some(w => ql.includes(w));

  // ── Revisar formulación ──────────────────────────────────
  if(has('revisa','formula','formulacion') && (d.problem || c.objeto)) {
    const prob = d.problem || '';
    if(!prob.trim()) return `Todavía no escribiste la formulación. Completá el campo de "formulación del problema" y volvé a pedirme que la revise.`;
    const hasCause = has('porque','falla','fallo','causa','debido','por falta','generó');
    const hasSolution = has('hay que','se debe','debería','solución','arreglar','corregir','implementar');
    if(hasCause) return `Tu formulación <strong>"${prob.slice(0,60)}…"</strong> menciona una causa probable. Reformulá describiendo solo lo que se observa — sin explicar por qué pasó. Ej: <em>"${c.objeto||'el componente'} presenta [condición observable]"</em>.`;
    if(hasSolution) return `Cuidado — la formulación menciona una solución o acción. Debe describir el <strong>hecho observable</strong> únicamente. Ej: <em>"${c.objeto||'el componente'} presenta [síntoma medible]"</em>.`;
    if(prob.length < 20) return `La formulación es muy corta. Intentá incluir: <strong>qué</strong> falla, <strong>en qué</strong> componente/proceso, y <strong>cómo</strong> se manifiesta (medible si es posible).`;
    return `Tu formulación <strong>"${prob.slice(0,70)}${prob.length>70?'…':''}"</strong> parece correcta — describe un hecho observable. Asegurate de que no mencione causas ni soluciones antes de avanzar.`;
  }

  // ── Condición esperada ───────────────────────────────────
  if(has('condicion esperada','condicion estandar','estandar','que pongo en condicion')) {
    return `La <strong>condición esperada</strong> es cómo debería estar funcionando el proceso o componente según el estándar. Por ejemplo: <em>"resistencia mínima de 4 MPa según especificación"</em>, o <em>"temperatura de autoclave entre 185°C y 195°C"</em>. Basate en planos, normas o históricos de producción.`;
  }

  // ── Áreas sin problema ───────────────────────────────────
  if(has('areas sin problema','donde no','turnos','cuando no','no ocurrio')) {
    return `Esta sección sirve para <strong>acotar el problema</strong>: si solo ocurre en turno mañana o en la línea 2, eso ya descarta causas. Si ocurre en todos lados, escribí "todos los turnos" o marcá N/A. Esa comparación es clave para el Ishikawa.`;
  }

  // ── Reincidencia ─────────────────────────────────────────
  if(has('reincidencia','primera vez','volvio','se repite','ya paso')) {
    const reincObj = c.objeto ? `para <strong>${c.objeto}</strong>` : '';
    return `<strong>Reincidencia</strong> significa que este problema ya ocurrió antes ${reincObj}. Si es reincidente, revisá si había una OCC anterior y si las acciones previas se implementaron correctamente. Ayuda a priorizar el análisis.`;
  }

  // ── Ishikawa ─────────────────────────────────────────────
  if(has('ishikawa','6m','espina','diagrama','categoria','mano de obra','material','maquina','metodo','medio ambiente','medicion')) {
    const cats = { 'mano de obra':'habilidades, capacitación, fatiga o errores humanos', 'maquina':'fallas de equipo, desgaste, mantenimiento', 'material':'calidad de insumos, variabilidad del material', 'metodo':'procedimientos, instrucciones de trabajo, secuencia', 'medio ambiente':'temperatura, humedad, polvo, vibraciones', 'medicion':'calibración, errores de medición, instrumentos' };
    const found = Object.keys(cats).find(k => ql.includes(k));
    if(found) return `En la categoría <strong>${found.charAt(0).toUpperCase()+found.slice(1)}</strong> se analizan: ${cats[found]}. Listá todas las hipótesis posibles — después con los 5 Porqués las filtramos.`;
    return `El <strong>Ishikawa</strong> organiza las posibles causas en 6 categorías (6M). No necesitás llenar todas — enfocate en las que tienen sentido para este evento${c.objeto?` en <strong>${c.objeto}</strong>`:''}. Los chips verdes son sugerencias generadas por la IA.`;
  }

  // ── 5 Porqués ────────────────────────────────────────────
  if(has('5 porques','porques','por que','raiz','causa raiz','niveles','circular')) {
    return `Los <strong>5 Porqués</strong> consisten en preguntarte "¿por qué?" ante cada respuesta, hasta llegar a la causa que podés controlar. Evitá respuestas circulares como <em>"porque falló"</em>. Necesitás mínimo 3 niveles. La causa raíz suele ser un sistema, proceso o decisión — no una persona.`;
  }

  // ── Plan de acción ───────────────────────────────────────
  if(has('accion','plan','responsable','fecha','tarea','implementar')) {
    return `Cada acción debe atacar directamente la <strong>causa raíz</strong>, no el síntoma. Definí: <em>qué</em> se hace, <em>quién</em> es responsable y <em>cuándo</em> debe estar listo. Si la causa raíz fue un procedimiento faltante, la acción es crear y capacitar en ese procedimiento.`;
  }

  // ── Evidencia / verificación ─────────────────────────────
  if(has('evidencia','verificacion','resultado','funciono','impacto','foto','aprendizaje')) {
    return `La <strong>evidencia</strong> debe demostrar que la causa raíz fue eliminada — no que se hizo la acción. Puede ser una medición antes/después, un registro de producción, o una foto. El <strong>aprendizaje</strong> es lo que queda para que otros operarios eviten el mismo problema.`;
  }

  // ── Ayuda general según paso ─────────────────────────────
  const helpByStep = [
    `En este paso completás el contexto del evento. Los campos obligatorios son: <strong>objeto afectado</strong>, <strong>condición actual</strong>, <strong>condición esperada</strong> y <strong>cómo se detectó</strong>. ¿Sobre cuál tenés dudas?`,
    `Aquí formulás el problema como un <strong>hecho observable</strong>. El motor de validación te avisa si mencionás causas o soluciones. ¿Querés que revise tu formulación?`,
    `Completá el <strong>Ishikawa</strong> listando hipótesis en cada categoría relevante. Seleccioná (✓) las que analizarás con 5 Porqués. ¿Tenés dudas sobre alguna categoría?`,
    `Para cada causa seleccionada, respondé "¿por qué?" al menos 3 veces hasta llegar a la causa raíz. ¿Necesitás ayuda con alguna causa en particular?`,
    `Definí acciones concretas para eliminar la causa raíz. Cada acción necesita <strong>responsable</strong> y <strong>fecha</strong>. ¿Necesitás ayuda para redactar alguna?`,
    `Registrá si las acciones funcionaron, con evidencia concreta. Si tenés fotos, subilas. ¿Sobre qué tipo de evidencia tenés dudas?`,
  ];

  // ── Fuera de tema ────────────────────────────────────────
  const offTopic = has('clima','tiempo','chiste','broma','futbol','musica','pelicula','serie','comida','receta','precio','comprar','politica','noticias','deporte','juego','viaje','vacacion','dinero','bolsa','criptomoneda','horoscopo','amor','relacion','salud','medico','doctor');
  const nonsense = q.trim().length < 4 || /^[a-z]{1,4}$/.test(q.trim().toLowerCase());
  const isGreeting = has('hola','buenas','buen dia','buenos dias','buenas tardes','que tal','como estas','como andas');

  if(isGreeting) {
    return `¡Hola! Soy el asistente de Raíz, estoy acá para ayudarte a completar el análisis de causa raíz. ${helpByStep[step]}`;
  }
  if(nonsense) {
    return `No entendí bien tu pregunta. Podés preguntarme sobre los campos del formulario, sobre las herramientas de análisis (Ishikawa, 5 Porqués), o pedirme que revise lo que completaste.`;
  }
  if(offTopic) {
    return `Solo puedo ayudarte con el análisis de causa raíz que estás completando. Si tenés una duda sobre el formulario o las herramientas, con gusto te oriento.`;
  }
  if(c.objeto && (has('mi','este','analisis','occ','problema'))) {
    return `En tu análisis de <strong>${c.objeto}</strong>: ${helpByStep[step] || 'Contame en qué parte estás trabado.'}`;
  }

  // ── Fallback ─────────────────────────────────────────────
  return helpByStep[step] || `Estoy acá para ayudarte. Podés preguntarme sobre cualquier campo del formulario, sobre las herramientas de análisis, o pedirme que revise lo que completaste.`;
}

// Called from form inputs to trigger breathing

// ═══ PROACTIVE BUBBLE SYSTEM ════════════════════════════════
const RA_BUBBLES = {
  0: [
    { text: '¿Necesitás ayuda para completar el contexto?', cta: 'Sí, ayudame' },
    { text: '¿Sabés qué poner en "condición esperada"?', cta: 'Explicame' },
    { text: 'Cuanto más preciso sea el contexto, mejor funciona el análisis 💡', cta: 'Entendido' },
  ],
  1: [
    { text: '¿La formulación describe un hecho observable, sin mencionar causas?', cta: 'Revisá la mía' },
    { text: '¿Querés que te ayude a redactar el problema?', cta: 'Sí, ayudame' },
  ],
  2: [
    { text: '¿Tenés dudas sobre alguna de las 6 categorías del Ishikawa?', cta: 'Preguntame' },
    { text: 'No necesitás llenar todas las categorías — solo las relevantes al evento 💡', cta: 'Entendido' },
  ],
  3: [
    { text: '¿Llegaste a la causa raíz o seguís en síntomas?', cta: 'Revisá mi análisis' },
    { text: '¿Necesitás mínimo 3 niveles de "¿Por qué?" por causa seleccionada.', cta: 'Entendido' },
  ],
  4: [
    { text: '¿Las acciones atacan la causa raíz o solo el síntoma?', cta: 'Ayudame a revisar' },
    { text: '¿Tenés responsable y fecha definida para cada acción?', cta: 'Sí / No' },
  ],
  5: [
    { text: '¿Pudiste evidenciar que la causa raíz fue eliminada?', cta: 'Ayudame' },
    { text: '¿Documentaste el aprendizaje para que quede en el sistema?', cta: 'Sí, ya lo hice' },
  ],
};

let _raBubbleTimer = null;
let _raBubbleIdx = {};  // track which bubble to show per step
let _raBubbleCooldown = false;

function raStartIdleWatch() {
  raClearIdleWatch();
  if(APP.view !== 'wizard') return;
  // Show first bubble after 18s idle, then every 30s
  _raBubbleTimer = setTimeout(raShowBubble, 18000);
}

function raClearIdleWatch() {
  clearTimeout(_raBubbleTimer);
  _raBubbleTimer = null;
}

function raShowBubble() {
  if(APP.view !== 'wizard') return;
  if(RA.open !== false) return; // panel already open, no bubble needed
  if(_raBubbleCooldown) return;
  if(document.getElementById('ra-bubble')) return; // already showing

  const step = APP.wizardStep;
  const pool = RA_BUBBLES[step] || RA_BUBBLES[0];
  const idx = (_raBubbleIdx[step] || 0) % pool.length;
  _raBubbleIdx[step] = idx + 1;
  const bubble = pool[idx];

  // Create bubble element
  const el = document.createElement('div');
  el.id = 'ra-bubble';
  el.className = 'ra-bubble';
  el.innerHTML = `
    <button class="ra-bubble-dismiss" onclick="event.stopPropagation();raDismissBubble(event)">✕</button>
    <div class="ra-bubble-text">${bubble.text}</div>
    <button class="ra-bubble-cta" onclick="event.stopPropagation();raOpenFromBubble(${JSON.stringify(bubble.cta)})">${bubble.cta} →</button>
  `;
  el.addEventListener('click', () => raOpenFromBubble(bubble.cta));
  document.body.appendChild(el);

  // Auto-dismiss after 12s if no interaction
  setTimeout(() => raDismissBubble(), 12000);
  // Schedule next bubble
  _raBubbleTimer = setTimeout(raShowBubble, 30000);
}

function raDismissBubble(e) {
  if(e) e.stopPropagation();
  const el = document.getElementById('ra-bubble');
  if(!el) return;
  el.classList.add('hiding');
  setTimeout(() => el.remove(), 220);
  _raBubbleCooldown = true;
  setTimeout(() => _raBubbleCooldown = false, 8000);
}

function raOpenFromBubble(cta) {
  raDismissBubble();
  RA.open = true;
  // Pre-fill the question in the assistant
  raSendText(`${cta}`);
  injectAssistantOverlay(APP.wizardStep);
}

// Reset idle watch on any user interaction with the form
function raUserActivity() {
  raClearIdleWatch();
  raDismissBubble();
  raStartIdleWatch();
}

let _raBreathTimer = null;
function raUserTyping() {
  RA.listening = true;
  injectAssistantOverlay(APP.wizardStep);
  clearTimeout(_raBreathTimer);
  _raBreathTimer = setTimeout(() => {
    RA.listening = false;
    injectAssistantOverlay(APP.wizardStep);
  }, 2000);
}

function renderWStep0(){
  const tl=t(); const d=APP.wizardData; const c=d.ctx;

  function naRow(key, label, sublabel, inputHtml){
    const isNA = c[key+'NA'];
    return `
    <div class="ctx-field ${isNA?'ctx-na-active':''}">
      <div class="ctx-lbl-row">
        <span class="ctx-lbl">${label} <span class="ctx-req">*</span></span>
        ${sublabel?`<span class="ctx-sublbl">${sublabel}</span>`:''}
      </div>
      ${isNA ? `
        <div class="ctx-just-wrap">
          <textarea class="ctx-just" placeholder="Justificá por qué no aplica este dato en este caso..."
            oninput="APP.wizardData.ctx['${key}Just']=this.value;scheduleCtxAI()"
          >${c[key+'Just']||''}</textarea>
        </div>` : inputHtml}
      <label class="ctx-na-toggle">
        <input type="checkbox" ${isNA?'checked':''} onchange="APP.wizardData.ctx['${key}NA']=this.checked;APP.wizardData.ctx['${key}']='';renderContent()">
        <span>No aplica / no disponible — justificar</span>
      </label>
    </div>`;
  }

  const aiState = d.ctxAiStatus||'';
  const aiIcon = aiState==='checking'?'⟳':aiState==='ok'?'✓':aiState==='warn'?'⚠':'🤖';

  return `
  <div class="ctx-wrap">

    <!-- SECCIÓN A -->
    <div class="ctx-section">
      <div class="ctx-section-header">
        <div class="ctx-section-badge">A</div>
        <div class="ctx-section-label">¿Qué pasó?</div>
        <div class="ctx-section-desc">Hechos observables — sin causas ni interpretaciones</div>
      </div>
      <div class="ctx-fields">

        <div class="ctx-field">
          <div class="ctx-lbl-row">
            <span class="ctx-lbl">Objeto o proceso afectado <span class="ctx-req">*</span></span>
            <span class="ctx-sublbl">¿Qué componente, equipo o producto?</span>
          </div>
          <input class="ctx-input" type="text" value="${c.objeto||''}"
            placeholder="Ej: ladrillo cara vista, autoclave 3, cinta transportadora..."
            oninput="APP.wizardData.ctx.objeto=this.value;scheduleCtxAI();scheduleSimilarOCCCheck(this.value);raUserTyping();raUserActivity()">
          <div id="similar-occ-panel"></div>
        </div>

        <div class="ctx-field">
          <div class="ctx-lbl-row">
            <span class="ctx-lbl">Condición actual observada <span class="ctx-req">*</span></span>
            <span class="ctx-sublbl">Lo que se ve — no lo que se cree que causa</span>
          </div>
          <textarea class="ctx-ta" placeholder="Describí exactamente lo que se observa. Ej: «las piezas presentan fisuras en la cara superior de 2-5mm de ancho»"
            oninput="APP.wizardData.ctx.condActual=this.value;scheduleCtxAI();raUserTyping();raUserActivity()">${c.condActual||''}</textarea>
        </div>

        <div class="ctx-field">
          <div class="ctx-lbl-row">
            <span class="ctx-lbl">Condición esperada / estándar <span class="ctx-req">*</span></span>
            <span class="ctx-sublbl">¿Qué debería estar pasando?</span>
          </div>
          <textarea class="ctx-ta" placeholder="Ej: «piezas sin fisuras, resistencia mínima de 4 MPa según especificación»"
            oninput="APP.wizardData.ctx.condEsperada=this.value;scheduleCtxAI()">${c.condEsperada||''}</textarea>
        </div>

        <div class="ctx-field">
          <div class="ctx-lbl-row">
            <span class="ctx-lbl">¿Cómo se detectó? <span class="ctx-req">*</span></span>
          </div>
          <div class="ctx-opts-row">
            ${tl.ctx_deteccionOpts.map((op,oi)=>`
              <button class="ctx-opt-btn ${(Array.isArray(c.deteccion)?c.deteccion:[c.deteccion]).includes(op)?'on':''}"
                data-detval="${oi}"
                onclick="selectDeteccion(${oi})">
                ${(Array.isArray(c.deteccion)?c.deteccion:[c.deteccion]).includes(op)?'✓ ':'+  '}${op}
              </button>`).join('')}
          </div>
          ${(()=>{
            const det = Array.isArray(c.deteccion)?c.deteccion:[];
            const otroLabel = APP.lang==='es'?'Otro':'Other';
            if(!det.includes(otroLabel)) return '';
            return `<div style="margin-top:10px">
              <input class="ctx-input" type="text"
                placeholder="${APP.lang==='es'?'Especificá cómo se detectó...':'Specify how it was detected...'}"
                value="${c.deteccionOtro||''}"
                oninput="APP.wizardData.ctx.deteccionOtro=this.value;scheduleCtxAI()"
                style="width:100%;margin-top:4px">
            </div>`;
          })()}
        </div>

      </div>
    </div>

    <!-- SECCIÓN B -->
    <div class="ctx-section">
      <div class="ctx-section-header">
        <div class="ctx-section-badge">B</div>
        <div class="ctx-section-label">¿Cuánto impacta?</div>
        <div class="ctx-section-desc">Datos numéricos — sin número no hay problema medible</div>
      </div>
      <div class="ctx-fields">

        ${naRow('cantidad', 'Unidades / piezas afectadas', 'Ingresá un número', `
          <div class="ctx-num-wrap">
            <input class="ctx-input ctx-num" type="number" min="0" step="1" value="${c.cantidad||''}"
              placeholder="0"
              oninput="APP.wizardData.ctx.cantidad=this.value;scheduleCtxAI()" onchange="APP.wizardData.ctx.cantidad=this.value;scheduleCtxAI()">
            <span class="ctx-num-unit">unidades</span>
          </div>`)}

        ${naRow('impactoTiempo', 'Tiempo de parada o impacto', 'Ingresá un número en minutos', `
          <div class="ctx-num-wrap">
            <input class="ctx-input ctx-num" type="number" min="0" step="1" value="${c.impactoTiempo||''}"
              placeholder="0"
              oninput="APP.wizardData.ctx.impactoTiempo=this.value;scheduleCtxAI()" onchange="APP.wizardData.ctx.impactoTiempo=this.value;scheduleCtxAI()">
            <span class="ctx-num-unit">minutos</span>
          </div>`)}

        <div class="ctx-field">
          <div class="ctx-lbl-row">
            <span class="ctx-lbl">Contención: ¿cómo y cuándo se repuso el servicio? <span class="ctx-req">*</span></span>
            <span class="ctx-sublbl">Lo que se hizo para seguir produciendo. No es la solución.</span>
          </div>
          <textarea class="ctx-ta" placeholder="Ej: se cambió el manchón del acople con uno de otra bomba; el desencofrador volvió a las 14:30"
            oninput="APP.wizardData.ctx.contencion=this.value">${esc(c.contencion||'')}</textarea>
        </div>

        <div class="ctx-field">
          <div class="ctx-lbl-row">
            <span class="ctx-lbl">¿Qué demoró la reposición?</span>
            <span class="ctx-sublbl">Obligatorio si la parada superó ${RESP_MIN} minutos</span>
          </div>
          <textarea class="ctx-ta" placeholder="Ej: el equipo de respaldo tenía el cilindro reparado pero sin montar"
            oninput="APP.wizardData.ctx.demora=this.value">${esc(c.demora||'')}</textarea>
        </div>

        <div class="ctx-field">
          <div class="ctx-lbl-row">
            <span class="ctx-lbl">¿Ya ocurrió antes este mismo problema? <span class="ctx-req">*</span></span>
          </div>
          <div class="ctx-yesno-row">
            <button class="ctx-yn-btn ${c.reincidencia==='si'?'on':''}"
              onclick="selectReincidencia('si')">Sí</button>
            <button class="ctx-yn-btn ${c.reincidencia==='no'?'on':''}"
              onclick="selectReincidencia('no')">No</button>
          </div>
        </div>

      </div>
    </div>

    <!-- SECCIÓN C -->
    <div class="ctx-section">
      <div class="ctx-section-header">
        <div class="ctx-section-badge">C</div>
        <div class="ctx-section-label">¿Dónde y cuándo NO ocurrió?</div>
        <div class="ctx-section-desc">Elimina el 80% de las causas falsas antes del análisis</div>
      </div>
      <div class="ctx-fields">

        ${naRow('turnosNo', 'Turnos donde NO ocurrió', '¿En qué turnos el problema estuvo ausente?', `
          <textarea class="ctx-ta" placeholder="Ej: «turno mañana y tarde no presentaron el problema — solo turno noche»"
            oninput="APP.wizardData.ctx.turnosNo=this.value;scheduleCtxAI()">${c.turnosNo||''}</textarea>`)}

        ${naRow('areasNo', 'Máquinas / áreas donde NO ocurrió', '¿Dónde no se vio el problema?', `
          <textarea class="ctx-ta" placeholder="Ej: «autoclave 1 y 2 sin problema — solo autoclave 3»"
            oninput="APP.wizardData.ctx.areasNo=this.value;scheduleCtxAI()">${c.areasNo||''}</textarea>`)}

      </div>
    </div>

    ${renderCtxAiPanel(d)}

  </div>`;
}

// Separado de renderWStep0 para poder refrescarlo solo (sin reemplazar todo
// el formulario) y no perder el foco del campo donde el usuario está
// escribiendo cuando termina el chequeo de IA con debounce.
function renderCtxAiPanel(d){
  const aiState = d.ctxAiStatus||'';
  return `<div class="ctx-ai-panel" id="ctx-ai-panel">
      <div class="ctx-ai-panel-header ${aiState}">
        <span class="ai-badge">${aiState==='checking'?'PROCESANDO':aiState==='ok'?'VALIDADO':aiState==='warn'?'REVISAR':'MOTOR IA'}</span>
        <span class="ai-status-text">
          ${aiState==='checking'
            ? `Revisando consistencia interna del contexto...`
            : aiState==='ok'
              ? `Contexto validado — sin inconsistencias detectadas`
              : aiState==='warn'
                ? `Se detectaron datos que requieren revisión antes de continuar`
                : `Activo — analizará el contexto mientras completás los campos`}
        </span>
        <span class="ctx-ai-dot"></span>
      </div>
      ${(()=>{
        const findings = d.ctxAiFindings || [];
        if(aiState==='idle' || aiState==='') return `<div class="ctx-ai-empty">Completá el objeto afectado y la condición actual para activar el análisis de consistencia.</div>`;
        if(aiState==='checking') return `<div class="ctx-ai-empty"><span class="ai-spin">⟳</span>  Comparando campos del contexto...</div>`;
        if(!findings.length) return `<div class="ctx-ai-findings"><div class="ctx-ai-finding ok"><span class="ctx-ai-finding-icon">✦</span><span>Los datos del contexto son internamente consistentes. Podés continuar al siguiente paso.</span></div></div>`;
        return `<div class="ctx-ai-findings">${findings.map(f=>`
          <div class="ctx-ai-finding ${f.type}">
            <span class="ctx-ai-finding-icon">${f.type==='ok'?'✦':'◆'}</span>
            <span>${f.msg}</span>
          </div>`).join('')}</div>`;
      })()}
  </div>`;
}

function updateCtxAiPanel(){
  const el = document.getElementById('ctx-ai-panel');
  if(el) el.outerHTML = renderCtxAiPanel(APP.wizardData);
  else renderContent();
}

function renderWStepProblem(){
  const tl=t(); const d=APP.wizardData; const c=d.ctx;
  const sim=findSimilar(d.problem);

  // Guardian state
  const gs = d.probGuardianState||'idle';
  const gsIcon = {idle:'🛡',checking:'⟳',ok:'✓',warn:'⚠',block:'✗'}[gs]||'🛡';
  const gsTitle = {
    idle:'Motor de validación activo <span style="display:inline-flex;gap:3px;vertical-align:middle;margin-left:4px"><span style="width:4px;height:4px;border-radius:50%;background:var(--text3);display:inline-block;animation:blink-dot 2s ease-in-out infinite"></span><span style="width:4px;height:4px;border-radius:50%;background:var(--text3);display:inline-block;animation:blink-dot 2s ease-in-out .4s infinite"></span><span style="width:4px;height:4px;border-radius:50%;background:var(--text3);display:inline-block;animation:blink-dot 2s ease-in-out .8s infinite"></span></span>',
    checking:'Comparando la formulación contra los datos del contexto ingresado<span class="ai-typing"><span></span><span></span><span></span></span>',
    ok:'Formulación aprobada — describe un hecho observable coherente con el contexto',
    warn:'La formulación presenta aspectos a revisar antes de continuar',
    block:'Formulación bloqueada — contiene causa o solución, no un hecho observable'
  }[gs];

  // Build context summary from step 0
  const ctxItems = [
    c.objeto && ['Objeto', c.objeto],
    c.condActual && ['Condición actual', c.condActual.slice(0,80)+(c.condActual.length>80?'...':'')],
    c.cantidad && ['Cant. afectada', c.cantidad+' unidades'],
    c.impactoTiempo && ['Impacto', c.impactoTiempo+' min'],
    c.reincidencia && ['Reincidencia', c.reincidencia==='si'?'Sí':'No'],
    (c.turnosNo||c.turnosNoNA) && ['Turnos sin problema', c.turnosNoNA?'No aplica':c.turnosNo?.slice(0,50)],
    (c.areasNo||c.areasNoNA) && ['Áreas sin problema', c.areasNoNA?'No aplica':c.areasNo?.slice(0,50)],
  ].filter(Boolean);

  return `
  ${sim.length>0?`
  <div class="sim-panel">
    <div class="sim-hd"><span class="sim-title">🔍 ${tl.similarFound}</span></div>
    <p style="font-size:12px;color:var(--text2);margin-bottom:10px">${tl.similarSub}</p>
    ${sim.map(o=>`
    <div class="sim-item" onclick="openOCCDetail(${o.id})">
      <div><div class="sim-prob">${esc(o.problem)}</div><div class="sim-meta">N° ${o.num} · ${esc(o.date)}</div></div>
      <span style="font-size:11px;color:var(--blue);font-family:var(--fm)">→ Ver</span>
    </div>`).join('')}
  </div>`:'' }

  <!-- Context summary -->
  ${ctxItems.length>0?`
  <div class="ctx-summary">
    <div class="ctx-summary-title">Contexto ingresado</div>
    <div class="ctx-summary-grid">
      ${ctxItems.map(([k,v])=>`
      <div class="ctx-summary-item"><strong>${k}</strong>${v}</div>`).join('')}
    </div>
  </div>`:''}

  <!-- AI Draft — updated directly by generateProbDraft(), never re-rendered -->
  <div id="prob-draft-area"></div>
  <!-- Meta fields -->
  <div class="row-3 fg" style="margin-bottom:18px">
    <div><label class="fl">${tl.lblResp}</label>
      <input class="fi" type="text" value="${d.responsable}" placeholder="${tl.phResp}"
        oninput="APP.wizardData.responsable=this.value"></div>
    <div><label class="fl">${tl.area}</label>
      <select class="fi" onchange="APP.wizardData.area=this.value">
        ${tl.areas.map(a=>`<option ${d.area===a?'selected':''}>${a}</option>`).join('')}
      </select></div>
    <div><label class="fl">${tl.lblDate}</label>
      <input class="fi" type="date" value="${d.date}"
        onchange="APP.wizardData.date=this.value"></div>
  </div>

  <!-- Problem input + guardian -->
  <div style="margin-bottom:6px">
    <label class="fl" style="margin-bottom:8px">Formulación del problema <span style="color:var(--red);font-size:10px">*</span></label>
    <div class="prob-input-wrap">
      <textarea class="prob-input ${gs==='ok'?'ok':gs==='warn'||gs==='block'?'warn':''}"
        id="w-problem"
        placeholder="Describí el problema como hecho observable: ¿qué objeto, qué condición, en qué contexto?&#10;Ej: «Ladrillos de autoclave 3 presentan fisuras en cara superior — turno noche — 15% del lote»"
        oninput="APP.wizardData.problem=this.value;APP.wizardData.probGuardianState='idle';debounceRender();scheduleProbGuardian();raUserTyping();raUserActivity()"
      >${d.problem||''}</textarea>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-top:5px;margin-left:2px">
      Compara la formulación contra los datos del contexto registrado. Detecta causas, soluciones o contradicciones — no genera la respuesta.
    </div>
  </div>

  <!-- Guardian panel -->
  <div class="ai-validation-label">Motor de Validación</div>
  <div class="prob-guardian ${gs}" id="prob-guardian">
    <div class="prob-guardian-left">
      <div class="prob-guardian-sigil">
        ${gs==='checking'?`<span class="ai-spin" style="font-size:16px">⟳</span>`:
          gs==='ok'?'✦':gs==='warn'?'⚠':gs==='block'?'✕':'◈'}
      </div>
      <div class="prob-guardian-label">
        ${gs==='idle'?'EN ESPERA':gs==='checking'?'ANALIZANDO':gs==='ok'?'VALIDADO':gs==='warn'?'REVISAR':'BLOQUEADO'}
      </div>
    </div>
    <div class="prob-guardian-body">
      <div class="prob-guardian-title">${gsTitle}</div>
      ${d.probGuardianMsg?`<div class="prob-guardian-msg">${d.probGuardianMsg}</div>`:''}
    </div>
  </div>`;
}


function selectDeteccion(idx){
  const opts = t().ctx_deteccionOpts;
  const val = opts[idx];
  let det = APP.wizardData.ctx.deteccion;
  if(!Array.isArray(det)) det = det ? [det] : [];
  const i = det.indexOf(val);
  if(i >= 0) det.splice(i, 1);   // deselect
  else det.push(val);             // select
  APP.wizardData.ctx.deteccion = det;
  if(typeof scheduleCtxAI === 'function') scheduleCtxAI();
  renderContent();
}
function selectReincidencia(val){
  APP.wizardData.ctx.reincidencia = val;
  if(typeof scheduleCtxAI === 'function') scheduleCtxAI();
  renderContent();
}
function renderWStep1(){
  const tl=t(); const d=APP.wizardData;
  const sugg=d.ishiSuggestions;
  const loading=d.ishiSugLoading;

  return `
  <div class="sec-title">${tl.step1}</div>
  <p style="font-size:13px;color:var(--text2);margin-bottom:16px">${tl.step1sub}</p>
  <div class="ishi-grid">
    ${tl.cats.map(([key,label,cls])=>{
      const chips=sugg?.[key]||[];
      const chipsHtml = loading
        ? `<div class="ishi-ai-section"><div class="ishi-ai-label"><span class="ai-spin">⟳</span> ${APP.lang==='es'?'La IA analiza el contexto...':'AI analyzing context...'}</div></div>`
        : chips.length>0
          ? `<div class="ishi-ai-section">
               <div class="ishi-ai-label">✦ ${APP.lang==='es'?'Sugeridas por IA — tocá para agregar':'AI suggestions — tap to add'}</div>
               <div class="ishi-chips">
                 ${chips.map(chip=>`<button class="ishi-chip" onclick="addIshiChip('${key}',${JSON.stringify(chip)})"><span class="ishi-chip-icon">+</span>${chip}</button>`).join('')}
               </div>
               <div class="ishi-ai-note">${APP.lang==='es'?'Podés editarlas o agregar las tuyas libremente':'You can edit them or freely add your own'}</div>
             </div>`
          : sugg
            ? ''  // no suggestions for this category — show nothing
            : `<div class="ishi-ai-section" id="ishi-ai-${key}"></div>`;
      return `
    <div class="ishi-cat">
      <div class="ishi-lbl ${cls}">${label}</div>
      ${chipsHtml}
      ${d.causes[key].map((v,i)=>`
      <div class="ci-row">
        <span class="ci-n">${i+1}</span>
        <input class="ci" type="text" value="${v}" placeholder="${APP.lang==='es'?'Causa posible...':'Possible cause...'}"
          oninput="updateCauseText('${key}',${i},this.value)">
        <button class="sel-btn ${isCauseSelected(key,i,v)?'on':''}" onclick="toggleCause('${key}',${i})" title="${APP.lang==='es'?'Seleccionar':'Select'}">✓</button>
      </div>`).join('')}
      <button onclick="addCauseRow('${key}')" style="background:none;border:none;color:var(--text3);font-size:12px;cursor:pointer;padding:3px 0;margin-top:2px">+ ${APP.lang==='es'?'agregar':'add'}</button>
    </div>`;
    }).join('')}
  </div>
  <div style="margin-top:14px;padding:11px 14px;background:var(--surface2);border-radius:7px;font-size:13px;color:var(--text2)">
    ✓ ${APP.lang==='es'?'Seleccionadas para análisis':'Selected for analysis'}:
    <strong style="color:var(--accent)">${APP.wizardData.selectedCauses.length}</strong>
    ${APP.wizardData.selectedCauses.length>0?' — '+APP.wizardData.selectedCauses.map(c=>getCauseVal(c)).filter(Boolean).join(' · '):''}
  </div>
  ${renderCauseVerifPanel()}`;
}

// ── Paso 3: verificación de causas seleccionadas ──
function setCauseVerif(vk,estado){
  const d=APP.wizardData; d.causeVerif=d.causeVerif||{};
  const v=d.causeVerif[vk]||{estado:'',dato:''};
  v.estado=v.estado===estado?'':estado; d.causeVerif[vk]=v; renderContent();
}
function renderCauseVerifPanel(){
  const d=APP.wizardData; d.causeVerif=d.causeVerif||{};
  const used=Object.values(d.causes).filter(a=>a.some(v=>v&&v.trim())).length;
  const sel=d.selectedCauses||[];
  const rows=sel.map(k=>{
    const p=k.split(':'); const vk=p[0]+':'+p[1]; const val=getCauseVal(k);
    const v=d.causeVerif[vk]||{estado:'',dato:''};
    return `<div class="cv-row ${v.estado}">
      <div class="cv-cause">${esc(val)}</div>
      <div class="cv-btns">
        <button class="cv-btn ok ${v.estado==='verificada'?'on':''}" onclick="setCauseVerif('${vk}','verificada')">✓ Verificada en planta</button>
        <button class="cv-btn hip ${v.estado==='hipotesis'?'on':''}" onclick="setCauseVerif('${vk}','hipotesis')">Todavía es hipótesis</button>
      </div>
      ${v.estado==='verificada'?`<input class="why-free-input" type="text" value="${esc(v.dato)}" placeholder="¿Qué viste, mediste o revisaste? Ej: medí la holgura del acople, 2,5 mm contra 1 mm de estándar"
        oninput="APP.wizardData.causeVerif['${vk}'].dato=this.value">`:''}
      ${v.estado==='hipotesis'?`<div class="cv-note">No pasa a los porqués hasta que la verifiques. Andá a planta a comprobarla o sacala de la selección.</div>`:''}
    </div>`;
  }).join('');
  return `
  ${used<3?`<div class="cv-box">
    <div class="cv-title">Usaste ${used} de 6 ramas</div>
    <div class="cv-sub">Si las otras no aplican, escribí por qué las descartás. Así nadie se pregunta si se miraron.</div>
    <textarea class="why-evidence-input" placeholder="Ej: Mano de obra: el operador es el mismo en los tres turnos y la falla solo aparece en uno. Materiales: no cambió el lote..."
      oninput="APP.wizardData.ishiDescarte=this.value">${esc(d.ishiDescarte||'')}</textarea>
  </div>`:''}
  ${sel.length?`<div class="cv-box">
    <div class="cv-title">Verificación de las causas seleccionadas</div>
    <div class="cv-sub">Solo las causas comprobadas con un dato pasan a los porqués. Una causa sin verificar es una opinión.</div>
    ${rows}
  </div>`:''}`;
}

// ── Paso 4: 5 porqués guiados ──
function renderWStep2(){
  const d=APP.wizardData;
  if(!d.whys||!d.whys.length) buildChains(d);
  if(!d.whys.length) return `<div class="empty"><div class="empty-icon">🎯</div><p style="color:var(--text2)">Sin causas verificadas. Volvé al paso anterior.</p></div>`;
  d.whys.forEach((w,wi)=>ensureHyps(wi));
  const nResp=d.whys.filter(w=>w.tipo==='respuesta').length;
  return `
  <div class="why-guide">
    <strong>Cómo funciona:</strong> en cada nivel elegís una hipótesis o escribís la tuya, y anotás qué viste en planta que la confirma. Después del tercer porqué decidís si llegaste a la causa de gestión: la decisión, regla, plan o control que faltaba. Si la cadena termina en una pieza rota o en un desgaste, todavía falta un porqué.
    ${nResp?`<div style="margin-top:8px">La parada superó ${RESP_MIN} minutos, así que hay una cadena extra para analizar <strong>por qué tardó tanto en reponerse</strong>.</div>`:''}
  </div>
  ${d.whys.map((w,wi)=>renderChain(w,wi)).join('')}`;
}
function renderChain(w,wi){
  const n=w.levels.length;
  const prev=chainPrev(w);
  const isResp=w.tipo==='respuesta';
  const levelsHtml=w.levels.map((l,li)=>`
    <div class="wc-lvl">
      <div class="wc-num">${li+1}</div>
      <div class="wc-body">
        <div class="wc-text">${esc(l.text)}</div>
        ${l.evidencia?`<div class="wc-ev">Evidencia: ${esc(l.evidencia)}</div>`:`<div class="wc-ev warn">Sin evidencia registrada</div>`}
      </div>
      ${w.cierre?'':`<button class="wc-edit" onclick="whyEditFrom(${wi},${li})">editar</button>`}
    </div>`).join('');

  let tail='';
  if(w.cierre==='gestion'){
    tail=`<div class="wc-root ok"><div class="wc-root-lbl">Causa raíz de gestión</div><div class="wc-root-txt">${esc(chainRoot(w))}</div><button class="wc-edit" onclick="whyReopen(${wi})">reabrir</button></div>`;
  } else if(w.cierre==='tecnica'){
    tail=`<div class="wc-root warn"><div class="wc-root-lbl">Cerrada como causa técnica · queda observada</div><div class="wc-root-txt">${esc(chainRoot(w))}</div><button class="wc-edit" onclick="whyReopen(${wi})">reabrir</button></div>`;
  } else if(w.decision){
    const last=chainRoot(w); const tech=looksTechnical(last)&&!looksManagement(last);
    tail=`<div class="wc-decide">
      <div class="wc-decide-q">¿"${esc(last)}" es la causa de gestión?</div>
      <div class="wc-decide-sub">Es de gestión si describe una decisión, regla, plan, estándar o control que faltaba o falló. Si describe una pieza, un desgaste o un síntoma, todavía hay que preguntar por qué.</div>
      ${tech?`<div class="wc-decide-warn">Parece describir una pieza o un síntoma. Probablemente falta un porqué.</div>`:''}
      <div class="wc-decide-btns">
        <button class="why-confirm-level-btn" onclick="whyDecide(${wi},'gestion')">Sí, es la causa de gestión</button>
        ${n<5?`<button class="btn-sec" onclick="whyDecide(${wi},'seguir')">No, sigo preguntando</button>`:`<button class="btn-sec" onclick="whyDecide(${wi},'tecnica')">Cerrar como causa técnica</button>`}
      </div>
    </div>`;
  } else {
    const hyps=(w.hyps||[]).filter(h=>h.estado!=='descartada');
    const q=isResp&&n===0?`¿Por qué la parada duró tanto? <em>${esc(w.cause)}</em>`:`¿Por qué <em>${esc(prev.length>90?prev.slice(0,89)+'…':prev)}</em>?`;
    tail=`<div class="wc-active">
      <div class="wc-q"><span class="wc-q-n">${n+1}° porqué</span>${q}</div>
      ${hyps.length?`<div class="wc-hyps-lbl">Hipótesis para verificar en planta${w.hypsAI?' · sugeridas por IA':''}</div>
      <div class="wc-hyps">${(w.hyps||[]).map((h,hi)=>h.estado==='descartada'?'':`
        <div class="wc-hyp ${looksManagement(h.text)?'mg':''}">
          <span>${esc(h.text)}</span>
          <button class="wc-hyp-use" onclick="whyUseHyp(${wi},${hi})">Usar</button>
          <button class="wc-hyp-x" title="Descartar" onclick="whyDiscardHyp(${wi},${hi})">✕</button>
        </div>`).join('')}</div>`:''}
      <label class="wc-lbl">Porqué que verificaste</label>
      <input class="why-free-input" id="why-txt-${wi}" type="text" value="${esc(w.own.text)}" placeholder="Escribí el porqué o tocá Usar en una hipótesis"
        oninput="APP.wizardData.whys[${wi}].own.text=this.value;APP.wizardData.whys[${wi}].own.origen='propia'">
      <label class="wc-lbl">Evidencia de planta <span style="color:var(--red)">*</span></label>
      <textarea class="why-evidence-input" id="why-ev-${wi}" placeholder="¿Qué viste, mediste o revisaste? Ej: el registro de mantenimiento muestra el último cambio hace 8 meses"
        oninput="APP.wizardData.whys[${wi}].own.evidencia=this.value">${esc(w.own.evidencia)}</textarea>
      <button class="why-confirm-level-btn" onclick="whyConfirm(${wi})">Confirmar ${n+1}° porqué</button>
      ${n<3?`<div class="wc-min">Mínimo 3 porqués con evidencia</div>`:''}
    </div>`;
  }
  return `<div class="why-guided-block ${isResp?'resp':''}" id="why-block-${wi}">
    <div class="why-guided-header">
      <div style="flex:1;min-width:0">
        <div class="wc-kind">${isResp?'Por qué duró tanto':'Cadena '+(wi+1)}</div>
        <div class="why-guided-cause-tag">${esc(w.cause)}</div>
      </div>
      <span class="wc-count ${w.cierre?'ok':''}">${w.cierre?'Cerrada':n+'/5'}</span>
    </div>
    <div class="why-guided-progress-bar"><div class="why-guided-progress-fill" style="width:${Math.round(Math.min(n,5)/5*100)}%"></div></div>
    ${levelsHtml}
    ${tail}
  </div>`;
}

// ── Paso 5: acciones ──
function renderWStep3(){
  const tl=t(); const d=APP.wizardData;
  return `
  <div class="why-guide">Cada acción tiene que atacar una causa raíz concreta. La que solo repone la pieza es contención, no contramedida.</div>
  <div class="act-hd">
    <span>${tl.colResp2} <span style="color:var(--red)">*</span></span>
    <span>${tl.colObj} <span style="color:var(--red)">*</span></span>
    <span>Ataca la causa <span style="color:var(--red)">*</span></span>
    <span>${tl.colDateExp} <span style="color:var(--red)">*</span></span>
    <span>${tl.colDateFin} <span style="color:var(--text3);font-size:10px">(opc.)</span></span>
    <span></span>
  </div>
  <div id="actions-list">
    ${d.actions.map((a,i)=>renderActRow(a,i)).join('')}
  </div>
  <button class="add-btn" onclick="addAction()">${tl.addAction}</button>`;
}
function renderActRow(a,i){
  const tl=t(); const d=APP.wizardData;
  const opts=(d.whys||[]).map((w,wi)=>`<option value="${w.id}" ${a.ataca===w.id?'selected':''}>${w.tipo==='respuesta'?'Duración':'Cadena '+(wi+1)}: ${esc((chainRoot(w)||w.cause).slice(0,50))}</option>`).join('');
  return `<div class="act-row" id="act-${i}">
    <input class="fi" style="font-size:12px;padding:8px 10px" type="text" placeholder="${tl.colResp2}" value="${esc(a.responsable)}"
      oninput="APP.wizardData.actions[${i}].responsable=this.value">
    <input class="fi" style="font-size:12px;padding:8px 10px" type="text" placeholder="Si hago X, espero Y medido por Z..." value="${esc(a.objective)}"
      oninput="APP.wizardData.actions[${i}].objective=this.value">
    <select class="fi" style="font-size:12px;padding:8px 10px" onchange="APP.wizardData.actions[${i}].ataca=this.value">
      <option value="">Elegí...</option>${opts}
    </select>
    <input class="fi" style="font-size:12px;padding:8px 10px" type="date" value="${a.dateExp||''}"
      oninput="APP.wizardData.actions[${i}].dateExp=this.value">
    <input class="fi" style="font-size:12px;padding:8px 10px" type="date" value="${a.dateFin||''}"
      oninput="APP.wizardData.actions[${i}].dateFin=this.value">
    <button class="del-btn" onclick="removeAction(${i})">✕</button>
  </div>`;
}

// ── Paso 6: seguimiento (la OCC no se cierra al crearla) ──
function renderWStep4(){
  const d=APP.wizardData; d.seg=d.seg||{indicador:'',meta:'',n:3,fecha:''}; const s=d.seg;
  const fotos=d.evidenciaFotos||[];
  return `
  <div class="why-guide">La OCC no se cierra acá. Se guarda, pasa a revisión de tu supervisor y se cierra cuando las mediciones confirmen que la causa se eliminó.</div>
  <div class="ctx-section">
    <div class="ctx-section-header"><div class="ctx-section-badge">S</div><div class="ctx-section-label">Cómo vamos a saber que funcionó</div></div>
    <div class="ctx-fields">
      <div class="ctx-field">
        <div class="ctx-lbl-row"><span class="ctx-lbl">¿Qué vas a medir? <span class="ctx-req">*</span></span><span class="ctx-sublbl">El indicador que muestra si el problema sigue</span></div>
        <input class="ctx-input" type="text" value="${esc(s.indicador)}" placeholder="Ej: horas de parada del desencofrador por semana" oninput="APP.wizardData.seg.indicador=this.value">
      </div>
      <div class="ctx-field">
        <div class="ctx-lbl-row"><span class="ctx-lbl">¿Qué valor confirma que la causa se eliminó? <span class="ctx-req">*</span></span></div>
        <input class="ctx-input" type="text" value="${esc(s.meta)}" placeholder="Ej: cero paradas por acople" oninput="APP.wizardData.seg.meta=this.value">
      </div>
      <div class="ctx-field">
        <div class="ctx-lbl-row"><span class="ctx-lbl">Mediciones seguidas que tienen que cumplir la meta</span><span class="ctx-sublbl">Una sola buena no alcanza</span></div>
        <div class="ctx-num-wrap"><input class="ctx-input ctx-num" type="number" min="1" max="12" value="${s.n||3}" oninput="APP.wizardData.seg.n=this.value"><span class="ctx-num-unit">mediciones</span></div>
      </div>
      <div class="ctx-field">
        <div class="ctx-lbl-row"><span class="ctx-lbl">Primera medición</span></div>
        <input class="ctx-input" type="date" style="max-width:220px" value="${s.fecha||''}" oninput="APP.wizardData.seg.fecha=this.value">
      </div>
    </div>
  </div>

  <div class="sec-title" style="margin-top:4px">Fotos del análisis <span style="color:var(--text3);font-size:10px;font-weight:400;text-transform:none;letter-spacing:0">(opcional)</span></div>
  <div class="photo-upload-area" id="photo-drop-zone" onclick="document.getElementById('photo-file-input').click()"
    ondragover="event.preventDefault();this.classList.add('drag-over')"
    ondragleave="this.classList.remove('drag-over')"
    ondrop="event.preventDefault();this.classList.remove('drag-over');handlePhotoFiles(event.dataTransfer.files)">
    <div class="photo-upload-icon">📷</div>
    <div class="photo-upload-text">Soltá fotos acá o <span style="color:var(--accent);text-decoration:underline;cursor:pointer">hacé clic para seleccionar</span></div>
    <div class="photo-upload-sub">JPG, PNG o WEBP · Máx. 5 fotos · 4 MB por foto</div>
    <input type="file" id="photo-file-input" accept="image/*" multiple style="display:none" onchange="handlePhotoFiles(this.files)">
  </div>
  ${fotos.length>0?`<div class="photo-grid" id="photo-grid">
    ${fotos.map((f,i)=>`<div class="photo-thumb" id="photo-thumb-${i}">
      <img src="${f.data}" alt="${esc(f.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px"/>
      <div class="photo-thumb-overlay"><span class="photo-thumb-name">${esc(f.name.length>18?f.name.slice(0,17)+'…':f.name)}</span>
      <button class="photo-thumb-del" onclick="removePhoto(${i})" title="Eliminar">✕</button></div></div>`).join('')}
  </div>`:''}

  ${renderQualityPanel(qualityChecks(qualityFromWizard(d)),'Así lo va a ver tu supervisor')}`;
}

// ── Guardar (alta o corrección) ──
async function saveNewOCC(){
  const d=APP.wizardData; const occs=getOCCs(); const now=nowISO();
  const isEdit=!!d._editId;
  const prev=isEdit?occs.find(o=>o.id===d._editId):null;
  const prevRaiz=(prev&&prev.context&&prev.context.raiz)||{};
  const hist=((prevRaiz.review&&prevRaiz.review.historial)||[]).concat([{accion:isEdit?'corregida y reenviada':'enviada a revisión',por:APP.user.name,fecha:now}]);
  const raiz=Object.assign({},prevRaiz,{
    version:2,
    selectedCauses:d.selectedCauses||[], causeVerif:d.causeVerif||{}, ishiDescarte:d.ishiDescarte||'',
    seguimiento:Object.assign({},d.seg||{},{n:parseInt((d.seg||{}).n)||3}),
    mediciones:prevRaiz.mediciones||[],
    creadoPor:prevRaiz.creadoPor||APP.user.id, creadoPorNombre:prevRaiz.creadoPorNombre||APP.user.name,
    ultimaActividad:now,
    review:{estado:'pendiente',enviadaPor:APP.user.name,fecha:now,historial:hist}
  });
  const ctx=Object.assign({},d.ctx||{}); delete ctx.raiz; ctx.raiz=raiz;
  const fields={
    date:d.date||now.split('T')[0], problem:d.problem, responsable:d.responsable, area:d.area,
    integrantes:d.integrantes||'', status:'open',
    causes:d.causes, whys:(d.whys||[]).map(cleanChainForSave), actions:d.actions,
    photos:d.evidenciaFotos||[], context:ctx,
  };
  try{
    if(isEdit){
      const ok=await SB.update('occs',d._editId,fields);
      if(!ok) throw new Error('update failed');
      Object.assign(prev,fields);
      APP._occs=occs.map(x=>x.id===prev.id?prev:x);
      toast(`OCC N° ${prev.num} corregida y reenviada a revisión`,'success');
    } else {
      const newNum=occs.length>0?Math.max(...occs.map(o=>o.num||0))+1:1;
      const newOCC=Object.assign({id:Date.now(),num:newNum,impact:null,evidencia:'',learning:'',created_by:APP.user.id,tenant_id:APP._tenant?.id},fields);
      const inserted=await SB.insert('occs',newOCC);
      APP._occs=[...occs,normalizeOCC(inserted||newOCC)];
      toast(`OCC N° ${newNum} guardada y enviada a revisión`,'success');
    }
    generateAlertNotifs();
    setView('occ'); raClearIdleWatch(); raDismissBubble();
  }catch(e){
    toast('Error al guardar OCC. Verificá tu conexión.','error');
    console.error(e);
  }
}

// ── Corregir una OCC devuelta (o completar una histórica) ──
function editOCC(id){
  const o=getOCCs().find(x=>x.id===id); if(!o) return;
  const c=Object.assign({},o.context||{}); const r=c.raiz||{}; delete c.raiz;
  const pad=a=>{a=(a||[]).slice();while(a.length<3)a.push('');return a;};
  const oc=o.causes||{};
  closeModal();
  APP.wizardStep=0; APP._ctxWarnOverride=false;
  APP.wizardData={
    _editId:o.id,
    problem:o.problem||'', responsable:o.responsable||APP.user.name, area:o.area||APP.user.area,
    date:o.date&&/^\d{4}-\d{2}-\d{2}/.test(o.date)?o.date:new Date().toISOString().split('T')[0],
    integrantes:o.integrantes||'',
    ishiSuggestions:null, ishiSugLoading:false,
    ctx:Object.assign({objeto:'',condActual:'',condEsperada:'',deteccion:[],cantidad:'',cantidadNA:false,cantidadJust:'',impactoTiempo:'',impactoTiempoNA:false,impactoTiempoJust:'',reincidencia:'',turnosNo:'',turnosNoNA:false,turnosNoJust:'',areasNo:'',areasNoNA:false,areasNoJust:'',contencion:'',demora:''},c),
    ctxAiStatus:'', ctxAiMsg:'', ctxAiFindings:[],
    probDraft:'', probDraftStatus:'used', probGuardianState:'idle',
    causes:{maquinaria:pad(oc.maquinaria),mano:pad(oc.mano),medio:pad(oc.medio),materiales:pad(oc.materiales),metodos:pad(oc.metodos),otros:pad(oc.otros)},
    selectedCauses:r.selectedCauses||[], causeVerif:r.causeVerif||{}, ishiDescarte:r.ishiDescarte||'',
    whys:(o.whys||[]).map(upgradeChain),
    actions:(o.actions&&o.actions.length)?JSON.parse(JSON.stringify(o.actions)):[{responsable:APP.user.name,objective:'',ataca:'',dateExp:'',dateFin:''}],
    seg:Object.assign({indicador:'',meta:'',n:3,fecha:''},r.seguimiento||{}),
    evidenciaFotos:o.photos||[],
  };
  if(APP.view!=='wizard') APP.navHistory.push(APP.view);
  setView('wizard');
}

// ═══════════════════════════════════════════════════════
// WIZARD LOGIC
// ═══════════════════════════════════════════════════════

// ═══ PHOTO EVIDENCE HANDLER ═══
function handlePhotoFiles(files) {
  if(!files || !files.length) return;
  const fotos = APP.wizardData.evidenciaFotos || [];
  const remaining = 5 - fotos.length;
  const toProcess = Array.from(files).slice(0, remaining);
  if(!toProcess.length){ toast('Máximo 5 fotos permitidas','warning'); return; }

  let processed = 0;
  toProcess.forEach(file => {
    if(!file.type.startsWith('image/')){ toast('Solo se permiten imágenes','warning'); return; }
    if(file.size > 4*1024*1024){ toast(`${file.name}: tamaño máximo 4 MB`,'warning'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      APP.wizardData.evidenciaFotos = APP.wizardData.evidenciaFotos || [];
      // Resize to max 1200px before storing
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if(w > MAX){ h = Math.round(h*MAX/w); w = MAX; }
        if(h > MAX){ w = Math.round(w*MAX/h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL('image/jpeg', 0.82);
        APP.wizardData.evidenciaFotos.push({ name: file.name, data, w, h });
        processed++;
        if(processed === toProcess.length) renderContent();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function removePhoto(idx) {
  APP.wizardData.evidenciaFotos = (APP.wizardData.evidenciaFotos||[]).filter((_,i)=>i!==idx);
  renderContent();
}

function wizPrev(){ APP.wizardStep=Math.max(0,APP.wizardStep-1); renderContent(); raUserActivity(); }

async function wizNext(){
  const tl=t(); const d=APP.wizardData;
  const lang=APP.lang;

  // ── STEP 0: Context ─────────────────────────────────────────────────────
  if(APP.wizardStep===0){
    const c = APP.wizardData.ctx;
    const lang = APP.lang;
    // Clear previous errors
    document.querySelectorAll('.ctx-field-error').forEach(el=>el.classList.remove('ctx-field-error'));

    const errors = [];
    if(!c.objeto?.trim())       errors.push({key:'ctx-objeto',  msg: lang==='es'?'¿Qué objeto está afectado?':'What object is affected?'});
    if(!c.condActual?.trim())   errors.push({key:'ctx-condActual', msg: lang==='es'?'Condición actual observable':'Current observable condition'});
    if(!c.condEsperada?.trim()) errors.push({key:'ctx-condEsperada', msg: lang==='es'?'Condición esperada (estándar)':'Expected condition (standard)'});
    const detArr = Array.isArray(c.deteccion)?c.deteccion:(c.deteccion?[c.deteccion]:[]);
    if(!detArr.length)          errors.push({key:'ctx-deteccion', msg: lang==='es'?'¿Cómo se detectó?':'How was it detected?'});
    if(!c.cantidad?.trim() && !c.cantidadNA) errors.push({key:'ctx-cantidad', msg: lang==='es'?'Cantidad afectada (o marcá N/A)':'Affected quantity (or mark N/A)'});
    if(!c.reincidencia?.trim()) errors.push({key:'ctx-reincidencia', msg: lang==='es'?'Primera vez o reincidencia':'First time or recurrence'});

    if(!c.impactoTiempoNA && !String(c.impactoTiempo||'').trim()) errors.push({key:'ctx-impactoTiempo', msg:'Tiempo de parada en minutos (o marcá N/A y justificá)'});
    if(!(c.contencion||'').trim()) errors.push({key:'ctx-contencion', msg:'Cómo y cuándo se repuso el servicio'});
    if(needsRespChain(c) && !(c.demora||'').trim()) errors.push({key:'ctx-demora', msg:'Qué demoró la reposición (la parada superó '+RESP_MIN+' min)'});
    // Justify N/A fields
    if(c.cantidadNA && !c.cantidadJust?.trim())     errors.push({key:'ctx-cantidad', msg: lang==='es'?'Justificá por qué no tenés la cantidad':'Justify why you don\'t have the quantity'});
    if(c.impactoTiempoNA && !c.impactoTiempoJust?.trim()) errors.push({key:'ctx-impactoTiempo', msg: lang==='es'?'Justificá por qué no tenés el tiempo de impacto':'Justify why you don\'t have the impact time'});
    if(c.turnosNoNA && !c.turnosNoJust?.trim())     errors.push({key:'ctx-turnosNo', msg: lang==='es'?'Justificá los turnos':'Justify the shifts'});
    if(c.areasNoNA && !c.areasNoJust?.trim())       errors.push({key:'ctx-areasNo', msg: lang==='es'?'Justificá las áreas':'Justify the areas'});

    if(errors.length>0){
      // Highlight each offending field
      const fields = document.querySelectorAll('.ctx-field');
      fields.forEach((f,i)=>{
        const lbl = f.querySelector('.ctx-lbl');
        if(!lbl) return;
        const txt = lbl.innerText||lbl.textContent||'';
        // match by position in DOM using index
      });
      // Just show toast with first error
      toast(lang==='es'?`Completá: ${errors[0].msg}`:`Fill in: ${errors[0].msg}`, 'warning');
      // Scroll to first ctx-field that has required and is empty
      const allFields = document.querySelectorAll('.ctx-field');
      const firstEmpty = Array.from(allFields).find(f=>{
        const inp = f.querySelector('input:not([type=checkbox]):not([type=number]), textarea');
        const num = f.querySelector('input[type=number]');
        const btns = f.querySelectorAll('.ctx-opt-btn.on, .ctx-yn-btn.on');
        const naBox = f.querySelector('input[type=checkbox]');
        if(naBox?.checked) return false;
        if(btns.length>0) return false;
        if(inp && !inp.value.trim()) return true;
        if(num && !num.value.trim()) return true;
        return false;
      });
      if(firstEmpty){ firstEmpty.classList.add('ctx-field-error'); firstEmpty.scrollIntoView({behavior:'smooth',block:'center'}); }
      return;
    }

    // If AI found inconsistency, warn but allow override on second click
    if(APP.wizardData.ctxAiStatus==='warn' && !APP._ctxWarnOverride){
      APP._ctxWarnOverride = true;
      toast(lang==='es'?'La IA detectó una inconsistencia. Si estás seguro, presioná Continuar de nuevo.':'AI detected an inconsistency. If sure, press Continue again.','warning');
      return;
    }
    APP._ctxWarnOverride = false;
  }

  // ── STEP 1: Problem formulation ──────────────────────────────
  if(APP.wizardStep===1){
    if(!d.problem.trim()||!d.responsable.trim()){
      toast(tl.fillFields,'warning');
      highlightEmpty(['w-problem']);
      return;
    }
    // Block if guardian explicitly blocked (cause/solution in problem statement)
    if(d.probGuardianState==='block'){
      toast('La formulación contiene una causa o solución — describí solo el hecho observable','warning');
      const ta=document.getElementById('w-problem');
      if(ta){ta.style.borderColor='var(--red)';setTimeout(()=>ta.style.borderColor='',2500);}
      return;
    }
    // 5W fields moved to Step 0 (Context) — no longer validated here
  }

  // ── STEP 2: Ishikawa + verificación ──────────────────────────
  if(APP.wizardStep===2){
    if(d.selectedCauses.length===0){toast(tl.selCause,'warning');return;}
    const emptySel = d.selectedCauses.filter(k=>!getCauseVal(k).trim());
    if(emptySel.length>0){toast(tl.selCause,'warning');return;}
    const usedCats = Object.values(d.causes).filter(a=>a.some(v=>v&&v.trim())).length;
    if(usedCats<3 && !(d.ishiDescarte||'').trim()){toast('Usaste menos de 3 ramas. Escribí por qué descartás las demás.','warning');return;}
    for(const k of d.selectedCauses){
      const p=k.split(':'); const v=(d.causeVerif||{})[p[0]+':'+p[1]];
      if(!v||v.estado!=='verificada'||(v.dato||'').trim().length<5){
        toast('"'+getCauseVal(k).slice(0,40)+'": verificala en planta y anotá el dato antes de seguir','warning');return;
      }
    }
    buildChains(d);
  }

  // ── STEP 3: 5 Porqués guiados ────────────────────────────────
  if(APP.wizardStep===3){
    if(!d.whys||!d.whys.length){toast('Sin causas para analizar','warning');return;}
    for(let i=0;i<d.whys.length;i++){
      const w=d.whys[i];
      if(!w.cierre){
        toast((w.tipo==='respuesta'?'Cadena de duración':'Cadena '+(i+1))+': '+(w.levels.length<3?'completá al menos 3 porqués con evidencia':'decidí si el último porqué es la causa de gestión'),'warning');
        const b=document.getElementById('why-block-'+i); if(b) b.scrollIntoView({behavior:'smooth',block:'center'});
        return;
      }
    }
  }

  // ── STEP 4: Acciones ─────────────────────────────────────────
  if(APP.wizardStep===4){
    if(!d.actions||d.actions.length===0){toast('Agregá al menos una acción','warning');return;}
    const inc=d.actions.filter(a=>!(a.objective||'').trim()||!(a.responsable||'').trim()||!a.dateExp||!a.ataca);
    if(inc.length){
      toast('Cada acción necesita responsable, objetivo, la causa que ataca y fecha esperada','warning');
      document.querySelectorAll('.act-row').forEach((row,i)=>{const a=d.actions[i];if(a&&(!(a.objective||'').trim()||!(a.responsable||'').trim()||!a.dateExp||!a.ataca)){row.style.background='rgba(224,62,62,0.08)';setTimeout(()=>{row.style.background='';},2000);}});
      return;
    }
    const sinAcc=d.whys.filter(w=>!d.actions.some(a=>a.ataca===w.id));
    if(sinAcc.length){toast('"'+(chainRoot(sinAcc[0])||sinAcc[0].cause).slice(0,50)+'" no tiene ninguna acción que la ataque','warning');return;}
  }

  // ── STEP 5: Seguimiento + guardar ────────────────────────────
  if(APP.wizardStep===5){
    const s=d.seg||{};
    if(!(s.indicador||'').trim()||!(s.meta||'').trim()){toast('Definí qué vas a medir y qué valor confirma que la causa se eliminó','warning');return;}
    await saveNewOCC(); return;
  }
  APP.wizardStep = Math.min(5, APP.wizardStep + 1);
  renderContent();
}

function updateWhyProgress(wi){
  const w = APP.wizardData.whys[wi];
  if(!w) return;
  const prog = document.getElementById(`why-prog-${wi}`);
  if(prog){
    const dots = prog.querySelectorAll('.why-dot');
    dots.forEach((dot,j)=>{
      const filled = w.answers[j]&&w.answers[j].trim();
      dot.className = 'why-dot' + (filled?(j<3?' min-met':' filled'):'');
    });
  }
  // Update counter
  const block = document.getElementById(`why-block-${wi}`);
  if(block){
    const filledCount = w.answers.filter(a=>a&&a.trim()).length;
    const minMet = filledCount>=3;
    const counter = block.querySelector('.why-bh span:last-child');
    if(counter){
      counter.textContent = `${filledCount}/5 ${APP.lang==='es'?'(mín. 3)':'(min. 3)'}`;
      counter.style.color = minMet?'var(--green)':'var(--red)';
    }
    // Update border colors on inputs
    const inputs = block.querySelectorAll('.why-inp');
    inputs.forEach((inp,j)=>{
      if(j<3) inp.style.borderColor = (w.answers[j]&&w.answers[j].trim())?'':'rgba(224,62,62,0.4)';
    });
  }
}

function highlightEmpty(ids){
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(el){
      el.style.borderColor='var(--red)';
      el.focus();
      setTimeout(()=>{el.style.borderColor='';},2000);
    }
  });
}

// cause helpers
function updateCauseText(cat,idx,newVal){
  const d=APP.wizardData;
  const oldVal=d.causes[cat][idx];
  const oldKey=cat+':'+idx+':'+oldVal;
  const pos=d.selectedCauses.indexOf(oldKey);
  d.causes[cat][idx]=newVal;
  if(pos>=0) d.selectedCauses[pos]=cat+':'+idx+':'+newVal;
}
function isCauseSelected(cat,idx,val){
  if(!val.trim()) return false;
  return APP.wizardData.selectedCauses.includes(cat+':'+idx+':'+val);
}
function getCauseVal(key){ return key.split(':').slice(2).join(':'); }
function toggleCause(cat,idx){
  const v=APP.wizardData.causes[cat][idx];
  if(!v.trim()) return;
  const key=cat+':'+idx+':'+v;
  const pos=APP.wizardData.selectedCauses.indexOf(key);
  if(pos>=0) APP.wizardData.selectedCauses.splice(pos,1);
  else APP.wizardData.selectedCauses.push(key);
  renderContent();
}
function addCauseRow(cat){APP.wizardData.causes[cat].push('');renderContent();}
function addAction(){
  APP.wizardData.actions.push({responsable:APP.user.name,objective:'',ataca:'',dateExp:'',dateFin:''});
  const c=document.getElementById('actions-list');
  if(c){const d=document.createElement('div');d.innerHTML=renderActRow(APP.wizardData.actions[APP.wizardData.actions.length-1],APP.wizardData.actions.length-1);c.appendChild(d.firstChild);}
}
function removeAction(i){
  if(APP.wizardData.actions.length<=1)return;
  APP.wizardData.actions.splice(i,1);
  renderContent();
}

// debounce re-render for similar check
let _debT=null;
function debounceRender(){clearTimeout(_debT);_debT=setTimeout(()=>{renderContent();},400);}

// ═══════════════════════════════════════════════════════
// AI CHECKS
// ═══════════════════════════════════════════════════════
let _aiT=null,_whyT={},_pgT=null;
// ── Ishikawa AI suggestions ───────────────────────────────────────────────────
async function loadIshiSuggestions(){
  const d = APP.wizardData;
  if(d.ishiSuggestions || d.ishiSugLoading) return;
  d.ishiSugLoading = true;
  document.querySelectorAll('.ishi-ai-section').forEach(el=>{
    el.innerHTML=`<div class="ishi-ai-label"><span class="ai-spin">⟳</span> ${APP.lang==='es'?'La IA analiza el contexto...':'AI analyzing context...'}</div>`;
  });
  const c=d.ctx; const lang=APP.lang;
  const prompt=`Eres un experto en análisis de causa raíz industrial usando el diagrama de Ishikawa 6M.
CONTEXTO DEL PROBLEMA:
- Objeto/proceso afectado: "${c.objeto||'—'}"
- Condición actual observable: "${c.condActual||'—'}"
- Condición esperada: "${c.condEsperada||'—'}"
- Cómo se detectó: "${c.deteccion||'—'}"
- Cantidad afectada: "${c.cantidadNA?'N/A':c.cantidad+' unidades'}"
- Tiempo de impacto: "${c.impactoTiempoNA?'N/A':c.impactoTiempo+' min'}"
- Primera vez: "${c.reincidencia==='si'?'Sí':'No, reincidencia'}"
- Turnos donde NO ocurrió: "${c.turnosNoNA?'N/A':c.turnosNo||'—'}"
- Áreas donde NO ocurrió: "${c.areasNoNA?'N/A':c.areasNo||'—'}"
TAREA: Causas POSIBLES y PLAUSIBLES por categoría 6M, específicas al contexto. NO genéricas.
Idioma: ${lang==='es'?'español':'english'}.
RESPONDÉ SOLO con JSON sin markdown:
{"maquinaria":["causa 1","causa 2","causa 3"],"mano":["causa 1","causa 2","causa 3"],"medio":["causa 1","causa 2"],"materiales":["causa 1","causa 2","causa 3"],"metodos":["causa 1","causa 2","causa 3"],"otros":["causa 1","causa 2"]}
Máximo 3 por categoría. Máximo 10 palabras por causa. Concretas y observables.`;
  try{
    const raw=(await callClaude(prompt, 700))||'{}';
    d.ishiSuggestions=JSON.parse(raw.replace(/```json|```/g,'').trim());
  }catch(e){ d.ishiSuggestions={}; }
  d.ishiSugLoading=false;
  if(APP.wizardStep===2) renderContent();
}

function addIshiChip(key,text){
  const causes=APP.wizardData.causes[key];
  const emptyIdx=causes.findIndex(v=>!v||!v.trim());
  if(emptyIdx>=0) APP.wizardData.causes[key][emptyIdx]=text;
  else APP.wizardData.causes[key].push(text);
  // Remove from suggestions so chip disappears
  if(APP.wizardData.ishiSuggestions?.[key])
    APP.wizardData.ishiSuggestions[key]=APP.wizardData.ishiSuggestions[key].filter(s=>s!==text);
  renderContent();
}

function scheduleAICheck(){clearTimeout(_aiT);_aiT=setTimeout(runAIStep0,1800);}


// ── CTX GUARDIAN — monitors context coherence in real time ────────────────────
let _ctxAiTimer = null;
function scheduleCtxAI(){
  clearTimeout(_ctxAiTimer);
  _ctxAiTimer = setTimeout(runCtxAI, 1800);
}

async function runCtxAI(){
  const d = APP.wizardData;
  const c = d.ctx;

  // Need at least objeto + one more field to be worth analyzing
  if(!c.objeto?.trim() || (!c.condActual?.trim() && !c.condEsperada?.trim())) return;

  d.ctxAiStatus = 'checking';
  d.ctxAiFindings = [];
  updateCtxAiPanel();

  const det = Array.isArray(c.deteccion) ? c.deteccion.join(', ') : (c.deteccion||'');
  const detFull = det + (c.deteccionOtro ? ` (${c.deteccionOtro})` : '');

  const prompt = `Sos un guardián de calidad en un sistema de análisis de causa raíz industrial (RCA).
Tu rol es revisar si los datos del CONTEXTO DE UN PROBLEMA son internamente coherentes.
NO evaluás si los datos son verdaderos — solo detectás contradicciones lógicas entre los campos.

DATOS DEL CONTEXTO:
- Objeto/proceso afectado: ${c.objeto||'no ingresado'}
- Condición actual observable: ${c.condActual||'no ingresado'}
- Condición esperada/estándar: ${c.condEsperada||'no ingresado'}
- Cómo se detectó: ${detFull||'no ingresado'}
- Cantidad afectada: ${c.cantidadNA?'marcado como N/A':(c.cantidad?c.cantidad+' unidades':'no ingresado')}
- Tiempo de parada: ${c.impactoTiempoNA?'marcado como N/A':(c.impactoTiempo?c.impactoTiempo+' minutos':'no ingresado')}
- Primera vez que ocurre: ${c.reincidencia==='si'?'Sí':c.reincidencia==='no'?'No, ya ocurrió antes':'no ingresado'}
- Turnos donde NO ocurre: ${c.turnosNoNA?'marcado como N/A':(c.turnosNo||'no ingresado')}
- Áreas donde NO ocurre: ${c.areasNoNA?'marcado como N/A':(c.areasNo||'no ingresado')}

Reglas para detectar inconsistencias:
1. Si condición actual = condición esperada → no hay problema real
2. Si "primera vez" = Sí pero "turnos sin problema" dice que ocurre en todos los turnos → contradicción
3. Si cantidad afectada es 0 → no hay magnitud medible
4. Si el objeto dice una cosa y la condición actual habla de otra cosa completamente distinta → incoherente
5. Si cantidad grande + tiempo de parada 0 → sospechoso (no es un error pero vale señalarlo)
6. Si hay campos que se contradicen entre sí → señalarlo

Respondé SOLO con este JSON (sin markdown, sin texto extra):
{
  "estado": "ok | warn",
  "hallazgos": [
    {"tipo": "ok | warn", "msg": "descripción concisa en 1 oración"},
    {"tipo": "ok | warn", "msg": "..."}
  ]
}
- Incluí máximo 3 hallazgos
- Si todo está bien, incluí 1 hallazgo tipo "ok" confirmando la coherencia
- Si hay problemas, incluí solo los hallazgos tipo "warn" relevantes`;

  try {
    const raw = await callClaude(prompt);
    const clean = raw.replace(/\`\`\`json|\`\`\`/g,'').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch { parsed = {estado:'ok', hallazgos:[{tipo:'ok',msg:'Contexto coherente.'}]}; }

    d.ctxAiStatus  = parsed.estado || 'ok';
    d.ctxAiFindings = (parsed.hallazgos||[]).map(h=>({type:h.tipo, msg:h.msg}));
    d.ctxAiMsg = '';
  } catch(e) {
    d.ctxAiStatus = 'idle';
    d.ctxAiFindings = [];
  }
  updateCtxAiPanel();
}

// ── AI Problem Draft Generator ────────────────────────────────────────────────
async function generateProbDraft(){
  const d = APP.wizardData;
  const c = d.ctx;

  // Only generate if context has enough data
  if(!c.objeto?.trim() || !c.condActual?.trim()) return;

  d.probDraftStatus = 'loading';
  d.probDraft = '';
  // Update draft panel directly without full re-render to avoid flicker loop
  const dp = document.getElementById('prob-draft-area');
  if(dp) dp.innerHTML = `<div class="prob-draft-wrap">
    <div class="prob-draft-header">
      <div class="prob-draft-badge"><span class="prob-draft-badge-dot"></span><span class="ai-spin">⟳</span> Motor de Validación &nbsp;·&nbsp; Construyendo formulación</div>
    </div>
    <div class="prob-draft-loading-wrap">
      <div class="prob-draft-loading-text">Redactando el enunciado del problema a partir del contexto registrado. Podés editarlo libremente una vez generado.</div>
    </div>
  </div>`;

  const det = Array.isArray(c.deteccion) ? c.deteccion.join(', ') : (c.deteccion||'');
  const prompt = `Sos un experto en análisis de causa raíz industrial (metodología 8D / PDCA).

Con los siguientes datos de contexto de un problema de planta, generá UNA SOLA ORACIÓN que formule el problema correctamente.
La formulación debe:
- Nombrar el objeto/proceso afectado
- Describir la condición observable (qué está pasando que no debería)
- Incluir el contexto relevante (magnitud, frecuencia, dónde ocurre)
- NO mencionar causas ni soluciones
- Ser concreta y específica — sin frases vagas

DATOS DE CONTEXTO:
- Objeto/proceso afectado: ${c.objeto}
- Condición actual observable: ${c.condActual}
- Condición esperada (estándar): ${c.condEsperada||'no especificada'}
- Cómo se detectó: ${det||'no especificado'}
- Cantidad afectada: ${c.cantidadNA?'no aplica':(c.cantidad+' unidades')||'no especificada'}
- Impacto en tiempo: ${c.impactoTiempoNA?'no aplica':(c.impactoTiempo+' minutos')||'no especificado'}
- Primera vez: ${c.reincidencia==='si'?'Sí, primera vez':'No, ya ocurrió antes'}
- Turnos sin problema: ${c.turnosNoNA?'no aplica':c.turnosNo||'no especificado'}
- Áreas sin problema: ${c.areasNoNA?'no aplica':c.areasNo||'no especificado'}

Respondé SOLO con la formulación del problema, sin comillas, sin prefijos, sin explicaciones.
Ejemplo de formato: "Los ladrillos del autoclave 3 presentan fisuras en la cara superior durante el turno noche, afectando 15 unidades por ciclo, cuando el estándar es cero fisuras."`;

  try {
    const r = await callClaude(prompt);
    const clean = r.replace(/```.*?```/gs,'').replace(/^["']|["']$/g,'').trim();
    d.probDraft = clean;
    d.probDraftStatus = 'ready';
    // Inject ready state directly — no renderContent
    const dp2 = document.getElementById('prob-draft-area');
    if(dp2 && !d.problem) dp2.innerHTML = `
      <div class="prob-draft-wrap">
        <div class="prob-draft-header">
          <div class="prob-draft-badge"><span class="prob-draft-badge-dot"></span>Motor de Validación &nbsp;·&nbsp; Formulación generada</div>
        </div>
        <div class="prob-draft-body">
          <div class="prob-draft-text">${clean}</div>
          <div class="prob-draft-actions">
            <button class="prob-draft-btn" onclick="useProbDraft()">Usar esta formulación</button>
            <button class="prob-draft-skip" onclick="document.getElementById('prob-draft-area').innerHTML='';APP.wizardData.probDraftStatus='dismissed'">Escribir manualmente</button>
          </div>
        </div>
      </div>`;
    else if(dp2) dp2.innerHTML = ''; // already has content typed
  } catch(e) {
    d.probDraftStatus = 'idle';
    const dp2 = document.getElementById('prob-draft-area');
    if(dp2) dp2.innerHTML = '';
  }
}

function useProbDraft(){
  const d = APP.wizardData;
  d.problem = d.probDraft;
  d.probDraftStatus = 'used';
  d.probGuardianState = 'idle';
  // Patch textarea and clear draft panel directly — no full re-render
  const ta = document.getElementById('w-problem');
  if(ta) ta.value = d.probDraft;
  const dp = document.getElementById('prob-draft-area');
  if(dp) dp.innerHTML = '';
  // Trigger guardian check on the draft
  setTimeout(scheduleProbGuardian, 300);
}
function scheduleProbGuardian(){clearTimeout(_pgT);_pgT=setTimeout(runProbGuardian,1600);}

async function runProbGuardian(){
  const d=APP.wizardData; const c=d.ctx;
  const prob=d.problem||'';
  if(prob.trim().length<15) return;

  // Build context summary for AI
  const ctxStr=[
    c.objeto && `Objeto: ${c.objeto}`,
    c.condActual && `Condición actual: ${c.condActual}`,
    c.condEsperada && `Condición esperada: ${c.condEsperada}`,
    c.deteccion && `Detección: ${c.deteccion}`,
    c.cantidad && `Cant. afectada: ${c.cantidad} unidades`,
    c.impactoTiempo && `Impacto: ${c.impactoTiempo} min`,
    c.reincidencia && `Reincidencia: ${c.reincidencia}`,
    (c.turnosNo||c.turnosNoNA) && `Turnos sin problema: ${c.turnosNoNA?'no aplica':c.turnosNo}`,
    (c.areasNo||c.areasNoNA) && `Áreas sin problema: ${c.areasNoNA?'no aplica':c.areasNo}`,
  ].filter(Boolean).join(' | ');

  d.probGuardianState='checking'; d.probGuardianMsg='';
  renderContent();

  const prompt=`Eres guardián de calidad en un sistema de análisis de causa raíz industrial.
Tu tarea: verificar si la FORMULACIÓN DEL PROBLEMA es coherente con el CONTEXTO ingresado.

CONTEXTO: ${ctxStr}
FORMULACIÓN: "${prob}"

Reglas estrictas:
1. Si la formulación menciona una CAUSA o SOLUCIÓN (ej: "porque el operario", "falla el motor"), es inválida — el problema debe ser un hecho observable.
2. Si la formulación contradice el contexto (ej: el contexto dice autoclave 3 pero el problema habla de otro equipo), es inválida.
3. Si la formulación es vaga ("hay un problema con...", "algo falla en...") sin especificar objeto/condición, es inválida.
4. Si la formulación es coherente con el contexto y describe hechos observables, es válida.

Respondé SOLO con este JSON (sin markdown):
{"estado":"ok|warn|block","mensaje":"1 oración explicando si está bien o qué debe corregirse"}
- ok: formulación válida y coherente
- warn: hay algo mejorable pero puede avanzar  
- block: contiene causa/solución o contradice el contexto — no puede avanzar`;

  try{
    const r=await callClaude(prompt);
    let parsed;
    try{ parsed=JSON.parse(r.replace(/```json|```/g,'').trim()); }
    catch{ parsed={estado:'ok',mensaje:''}; }
    d.probGuardianState=parsed.estado||'ok';
    d.probGuardianMsg=parsed.mensaje||'';
  }catch(e){
    d.probGuardianState='idle'; d.probGuardianMsg='';
  }
  renderContent();
}
function scheduleWhyCheck(wi){clearTimeout(_whyT[wi]);_whyT[wi]=setTimeout(()=>runAIWhy(wi),1800);}

async function runAIStep0(){
  const el=document.getElementById('ai-step0');
  if(!el)return;
  const d=APP.wizardData;
  const fields=[d.que,d.donde,d.cuando,d.cuantas,d.bajo].filter(Boolean);
  if(fields.length<2)return;
  el.innerHTML=`<div class="ai-panel"><div class="ai-ph"><div class="ai-av">🤖</div><div class="ai-nm">OCC AI</div></div><div class="ai-loading"><div class="dot-pulse"></div><div class="dot-pulse"></div><div class="dot-pulse"></div><span>${t().aiThink}</span></div></div>`;
  const prompt=APP.lang==='es'
    ?`Eres experto en análisis de problemas industriales. Analizá en máx 3 oraciones si la formulación contiene hechos observables o hay interpretaciones/frases vagas ("siempre pasa","por lo general","el operario falló" sin datos). Si está bien, confirmalo brevemente. QUÉ:"${d.que}"|DÓNDE:"${d.donde}"|CUÁNDO:"${d.cuando}"|CUÁNTAS:"${d.cuantas}"|CONDICIONES:"${d.bajo}"|QUÉ NO:"${d.queNo}"`
    :`You are an industrial problem analysis expert. In max 3 sentences, check if the description contains observable facts or vague phrases ("it always happens","the operator failed" without data). If OK, confirm briefly. WHAT:"${d.que}"|WHERE:"${d.donde}"|WHEN:"${d.cuando}"|HOW MANY:"${d.cuantas}"|CONDITIONS:"${d.bajo}"|WHAT NOT:"${d.queNo}"`;
  try{const r=await callClaude(prompt);if(el)el.innerHTML=`<div class="ai-panel"><div class="ai-ph"><div class="ai-av">🤖</div><div class="ai-nm">OCC AI</div></div><div class="ai-body">${r}</div></div>`;}
  catch(e){if(el)el.innerHTML='';}
}

async function runAIWhy(wi){
  const w=APP.wizardData.whys[wi];
  if(!w)return;
  const ans=w.answers.filter(Boolean);
  if(ans.length<2)return;
  const el=document.getElementById(`why-ai-${wi}`);
  if(!el)return;
  el.innerHTML=`<div class="ai-loading" style="margin-top:7px"><div class="dot-pulse"></div><div class="dot-pulse"></div><div class="dot-pulse"></div><span style="font-size:12px">${t().aiThink}</span></div>`;
  const prompt=APP.lang==='es'
    ?`Eres experto en causa raíz industrial. En máx 2 oraciones, detectá si hay razonamiento hacia atrás (la persona ya sabe la conclusión y construye los porqués para justificarla), saltos lógicos, o respuestas que no son hechos observables. Si la cadena es coherente, decilo. Causa:"${w.cause}" | ${ans.map((a,i)=>`${i+1}.${a}`).join('|')}`
    :`You are an industrial root cause expert. In max 2 sentences, detect backward reasoning (person already knows the conclusion and builds the whys to justify it), logical jumps, or non-observable answers. If the chain is coherent, say so. Cause:"${w.cause}" | ${ans.map((a,i)=>`${i+1}.${a}`).join('|')}`;
  try{
    const r=await callClaude(prompt);
    const ok=/(coherent|coherente|correct|correcto|lógica|logic|bien|good)/i.test(r);
    APP.wizardData.whys[wi].aiResult={ok,text:r};
    if(el) el.innerHTML=`<div class="${ok?'why-ok':'why-warn'}">${ok?'✓':'⚠️'} ${r}</div>`;
  }catch(e){if(el)el.innerHTML='';}
}

async function callClaude(prompt, maxTokens){
  const j = await api('ai', { prompt, max_tokens: maxTokens || 1000 });
  return j.text || '';
}

// ═══════════════════════════════════════════════════════
// OCC DETAIL + PDF
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// RAÍZ v75 — MÉTODO: reglas de revisión, hipótesis, cadenas
// Todo funciona sin IA. Si la IA responde, solo suma hipótesis.
// ═══════════════════════════════════════════════════════
const RESP_MIN = 60; // minutos de parada a partir de los cuales se exige analizar por qué duró tanto

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function normTxt(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');}
function nowISO(){return new Date().toISOString();}
function daysSince(iso){const t=Date.parse(iso);if(isNaN(t))return null;return Math.floor((Date.now()-t)/86400000);}
function fmtDay(iso){const t=Date.parse(iso);if(isNaN(t))return iso||'—';return new Date(t).toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});}

function ctxTiempo(c){const n=parseFloat(c&&c.impactoTiempo);return (c&&!c.impactoTiempoNA&&!isNaN(n))?n:0;}
function needsRespChain(c){return ctxTiempo(c)>=RESP_MIN;}

// ── Clasificación de un porqué: ¿gestión o pieza/síntoma? ──
const MGMT_WORDS=['plan','preventiv','procedimiento','estandar','norma','instructiv','control','registro','capacit','entren','responsab','frecuencia','definid','stock minimo','stock','compra','aprob','criterio','checklist','check list','auditor','seguimiento','rutina','asign','prioridad','presupuesto','repuesto','contingencia','respaldo'];
const PART_WORDS=['rot','desgast','fatig','gastad','vida util','se corta','se corto','quebr','fisur','agriet','oxid','corros','sucio','suciedad','tapad','obstru','pierde','perdida','fuga','falla','no funciona','no anda','trab','vencid','cumplio su vida'];
function looksManagement(t){const s=normTxt(t);return MGMT_WORDS.some(w=>s.includes(w))||/^no (hay|habia|existe|existia|estaba|esta|se (define|definio|controla|controlaba|registra|registraba|revisa|revisaba|planifica|planifico))/.test(s);}
function looksTechnical(t){const s=normTxt(t);return PART_WORDS.some(w=>s.includes(w));}

// ── Banco de hipótesis local (criterio de revisor, sin IA) ──
const HYP_BANK={
  pieza:['No tenía vida útil ni frecuencia de cambio definida','No estaba incluido en el plan preventivo','No había repuesto disponible en pañol','La inspección de rutina no detectaba ese desgaste','Trabajaba fuera de su condición de diseño (carga, alineación o lubricación)'],
  persona:['No hay un estándar escrito de cómo hacer la tarea','El estándar existe pero el personal no fue entrenado','No hay un control que detecte el error antes de que pase','La tarea depende de la experiencia de una sola persona'],
  material:['No hay stock mínimo definido para ese insumo','El pedido de compra no se aprobó a tiempo','No hay control de recepción del material','Cambió el proveedor o el lote y nadie lo verificó'],
  proceso:['Cambió una condición del proceso y nadie lo detectó','No hay un parámetro estándar definido para esa variable','No existe un control que lo detecte antes','El procedimiento no contempla esta situación'],
  respuesta:['El equipo de respaldo no estaba operativo','No había repuesto disponible para reponer rápido','No había procedimiento de contingencia para esta falla','Se tardó en detectar o en avisar la falla','No había personal con conocimiento de esa reparación en el turno'],
};
function hypPool(text){
  const s=normTxt(text);
  if(/operari|personal|capacit|error|olvid|no se ve|no sab|desconoc|nuevo|mal armad|mal cerrad|mal puest/.test(s)) return HYP_BANK.persona;
  if(/stock|falta de|compra|proveedor|lote|insumo|abastec|material|cemento|arena|alambre|aceite/.test(s)) return HYP_BANK.material;
  if(looksTechnical(s)||/bomba|acople|eje|rodamiento|cinta|motor|valvula|rolo|perno|junta|cilindro|cuchilla|manchon|reductor|cadena|engranaje|via|rueda|tapa|trampa/.test(s)) return HYP_BANK.pieza;
  return HYP_BANK.proceso;
}
function chainPrev(w){return w.levels.length?w.levels[w.levels.length-1].text:w.cause;}
function localHyps(w){
  const pool=(w.tipo==='respuesta'&&w.levels.length===0)?HYP_BANK.respuesta:hypPool(chainPrev(w));
  const used=w.levels.map(l=>normTxt(l.text));
  return pool.filter(h=>!used.includes(normTxt(h))).slice(0,3);
}
async function aiHyps(w){
  const c=(APP.wizardData&&APP.wizardData.ctx)||{};
  const chain=[w.cause].concat(w.levels.map(l=>l.text)).join(' -> ');
  const prompt='Sos experto en analisis de causa raiz industrial. Nivel '+(w.levels.length+1)+' de los 5 porques.\n'+
    'Objeto: '+(c.objeto||'')+'\nCondicion observada: '+(c.condActual||'')+'\nCadena: '+chain+'\n'+
    'Genera 3 hipotesis que el analista debe VERIFICAR EN PLANTA para el proximo porque. Al menos una debe ser una causa de gestion (plan, estandar, control, repuesto o decision que faltaba). Maximo 14 palabras cada una. Responde solo JSON: {"hipotesis":["a","b","c"]}';
  try{
    const raw=await Promise.race([callClaude(prompt),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),7000))]);
    const j=JSON.parse(String(raw||'').replace(/```json|```/g,'').trim());
    const list=(j.hipotesis||[]).map(x=>String(x).replace(/^Hip[oó]tesis:\s*/i,'').trim()).filter(Boolean);
    return list.length>=2?list:null;
  }catch(e){return null;}
}

// ── Cadenas de porqués ──
function newChain(cause,tipo){return {id:'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),cause:cause,tipo:tipo||'falla',levels:[],cierre:null,decision:false,hyps:null,hypsFor:-1,hypsAI:false,own:{text:'',evidencia:''},answers:['','','','','']};}
function syncAnswers(w){const a=w.levels.map(l=>l.text);while(a.length<5)a.push('');w.answers=a.slice(0,5);}
function upgradeChain(w){
  if(w&&Array.isArray(w.levels)) return Object.assign(newChain(w.cause,w.tipo),w,{hyps:null,hypsFor:-1,hypsAI:false,own:{text:'',evidencia:''},decision:false});
  const c=newChain((w&&w.cause)||'','falla');
  c.levels=((w&&w.answers)||[]).filter(a=>a&&String(a).trim()).map(a=>({text:String(a),evidencia:'',origen:'historica'}));
  syncAnswers(c);return c;
}
function chainRoot(w){const lv=Array.isArray(w.levels)?w.levels:(w.answers||[]).filter(Boolean).map(t=>({text:t}));return lv.length?lv[lv.length-1].text:'';}
function cleanChainForSave(w){return {id:w.id,cause:w.cause,tipo:w.tipo,levels:w.levels,cierre:w.cierre,answers:w.answers};}

function buildChains(d){
  const existing=d.whys||[];
  const claimed=new Set();
  const fallas=d.selectedCauses.filter(k=>getCauseVal(k).trim()).map(k=>{
    const val=getCauseVal(k);
    const p=k.split(':'); const vk=p[0]+':'+p[1];
    // match by stable cat:idx key first; fall back to text match only for
    // legacy chains (loaded from a saved OCC) that don't have srcKey yet
    let match=existing.find(w=>w.tipo!=='respuesta'&&!claimed.has(w)&&w.srcKey===vk);
    if(!match) match=existing.find(w=>w.tipo!=='respuesta'&&!claimed.has(w)&&!w.srcKey&&w.cause===val);
    if(match){ claimed.add(match); match.srcKey=vk; match.cause=val; return match; }
    const c=newChain(val,'falla'); c.srcKey=vk; return c;
  });
  if(needsRespChain(d.ctx)){
    const label='La parada duró '+ctxTiempo(d.ctx)+' min'+((d.ctx.demora||'').trim()?': '+d.ctx.demora.trim():'');
    let r=existing.find(w=>w.tipo==='respuesta');
    if(r) r.cause=label; else r=newChain(label,'respuesta');
    fallas.push(r);
  }
  d.whys=fallas;
}

function ensureHyps(wi){
  const w=APP.wizardData.whys[wi]; if(!w||w.cierre||w.decision) return;
  const lvl=w.levels.length;
  if(w.hypsFor===lvl&&w.hyps) return;
  w.hypsFor=lvl; w.hypsAI=false;
  w.hyps=localHyps(w).map(t=>({text:t,estado:null}));
  aiHyps(w).then(list=>{
    if(!list||w.hypsFor!==lvl||w.levels.length!==lvl) return;
    let hs=list.slice(0,3);
    if(!hs.some(looksManagement)){const m=localHyps(w).find(looksManagement);if(m)hs[hs.length-1]=m;}
    w.hyps=hs.map(t=>({text:t,estado:null})); w.hypsAI=true;
    if(APP.view==='wizard'&&APP.wizardStep===3) renderContent();
  }).catch(()=>{});
}

function whyUseHyp(wi,hi){const w=APP.wizardData.whys[wi];w.own.text=w.hyps[hi].text;w.own.origen='hipotesis';renderContent();setTimeout(()=>{const e=document.getElementById('why-ev-'+wi);if(e)e.focus();},60);}
function whyDiscardHyp(wi,hi){const w=APP.wizardData.whys[wi];w.hyps[hi].estado='descartada';renderContent();}
function whyConfirm(wi){
  const w=APP.wizardData.whys[wi];
  const text=(w.own.text||'').trim(), ev=(w.own.evidencia||'').trim();
  if(text.length<4){toast('Escribí el porqué o elegí una hipótesis','warning');return;}
  if(ev.length<5){toast('Anotá qué viste o mediste en planta que lo confirma','warning');const e=document.getElementById('why-ev-'+wi);if(e){e.focus();e.style.borderColor='var(--red)';}return;}
  const prev=normTxt(chainPrev(w));
  if(normTxt(text)===prev){toast('Ese porqué repite el anterior. Preguntá por qué pasó eso.','warning');return;}
  w.levels.push({text,evidencia:ev,origen:w.own.origen||'propia'});
  w.own={text:'',evidencia:''}; w.hyps=null; w.hypsFor=-1;
  syncAnswers(w);
  if(w.levels.length>=3) w.decision=true;
  renderContent();
}
async function whyDecide(wi,val){
  const w=APP.wizardData.whys[wi];
  if(val==='gestion'){
    const last=chainRoot(w);
    if(looksTechnical(last)&&!looksManagement(last)){
      if(!await raConfirm('El último porqué parece describir una pieza, un desgaste o un síntoma, no una decisión, regla o control que faltaba.\n\n¿Seguro que es la causa de gestión?',{confirmText:'Sí, es causa de gestión'})) return;
    }
    w.cierre='gestion'; w.decision=false;
  } else if(val==='tecnica'){
    if(!await raConfirm('La cadena queda cerrada como causa técnica y tu supervisor la va a ver observada. ¿Seguir?',{confirmText:'Seguir'})) return;
    w.cierre='tecnica'; w.decision=false;
  } else {
    w.decision=false;
  }
  renderContent();
}
async function whyEditFrom(wi,li){
  if(!await raConfirm('Se borran este porqué y los siguientes de la cadena. ¿Seguir?',{confirmText:'Borrar y seguir',danger:true})) return;
  const w=APP.wizardData.whys[wi];
  const removed=w.levels[li];
  w.levels=w.levels.slice(0,li); w.cierre=null; w.decision=false; w.hyps=null; w.hypsFor=-1;
  w.own={text:removed?removed.text:'',evidencia:removed?removed.evidencia:''};
  syncAnswers(w); renderContent();
}
function whyReopen(wi){const w=APP.wizardData.whys[wi];w.cierre=null;w.decision=w.levels.length>=3&&w.levels.length<5?true:w.levels.length>=5;renderContent();}

// ── Control automático del análisis (tu criterio de revisor) ──
function qualityFromWizard(d){return {ctx:d.ctx||{},whys:d.whys||[],actions:d.actions||[],causes:d.causes||{},raiz:{selectedCauses:d.selectedCauses||[],causeVerif:d.causeVerif||{},ishiDescarte:d.ishiDescarte||'',seguimiento:d.seg||{}}};}
function qualityFromOCC(o){const c=o.context||{};return {ctx:c,whys:o.whys||[],actions:o.actions||[],causes:o.causes||{},raiz:c.raiz||{}};}
function qualityChecks(x){
  const c=x.ctx||{}, r=x.raiz||{}, whys=x.whys||[], acts=x.actions||[];
  const res=[];
  const cant=parseFloat(c.cantidad), tiempo=ctxTiempo(c);
  const medido=(cant>0)||(tiempo>0);
  res.push({ok:medido,t:'Problema medido',d:medido?[(tiempo>0?tiempo+' min de parada':''),(cant>0?cant+' unidades afectadas':'')].filter(Boolean).join(' · '):'Falta el número: tiempo de parada o cantidad afectada'});
  const cont=(c.contencion||'').trim();
  res.push({ok:!!cont,t:'Contención registrada',d:cont?'Está escrito cómo se repuso el servicio':'Falta cómo y cuándo se repuso el servicio'});
  const used=Object.values(x.causes||{}).filter(a=>Array.isArray(a)&&a.some(v=>v&&String(v).trim())).length;
  const desc=(r.ishiDescarte||'').trim();
  res.push({ok:used>=3||!!desc,t:'Ishikawa completo',d:used>=3?used+' ramas analizadas':desc?'Ramas descartadas con justificación':'Solo '+used+' rama(s) y sin justificar las demás'});
  const sel=r.selectedCauses||[], ver=r.causeVerif||{};
  const sinVer=sel.filter(k=>{const p=String(k).split(':');const v=ver[p[0]+':'+p[1]];return !v||v.estado!=='verificada'||!(v.dato||'').trim();});
  res.push({ok:sel.length>0&&sinVer.length===0,t:'Causas verificadas con dato',d:!sel.length?'No hay registro de causas verificadas':sinVer.length?sinVer.length+' causa(s) sin verificar en planta':'Todas con un dato de planta'});
  const fallas=whys.filter(w=>w.tipo!=='respuesta');
  const malas=fallas.filter(w=>{
    if(Array.isArray(w.levels)) return w.levels.length<3||w.cierre!=='gestion'||w.levels.some(l=>!(l.evidencia||'').trim());
    const lv=(w.answers||[]).filter(a=>a&&String(a).trim());
    return lv.length<3||!looksManagement(lv[lv.length-1]);
  });
  res.push({ok:fallas.length>0&&malas.length===0,t:'Porqués hasta una causa de gestión',d:!fallas.length?'No hay cadenas de porqués':malas.length?malas.length+' cadena(s) cortas, sin evidencia o que terminan en la pieza':'Cada cadena termina en una decisión, regla o plan, con evidencia'});
  if(tiempo>=RESP_MIN){
    const rc=whys.find(w=>w.tipo==='respuesta');
    res.push({ok:!!(rc&&rc.cierre),t:'Por qué duró tanto',d:rc&&rc.cierre?'Analizado':'La parada fue de '+tiempo+' min y no se analizó por qué tardó en reponerse'});
  }
  const accOk=acts.length>0&&acts.every(a=>(a.responsable||'').trim()&&(a.objective||'').trim()&&a.dateExp);
  const chains=whys.filter(w=>w.id);
  const sinAcc=chains.filter(w=>!acts.some(a=>a.ataca===w.id));
  res.push({ok:accOk&&sinAcc.length===0,t:'Contramedidas con responsable y fecha',d:!acts.length?'Sin acciones':!accOk?'Hay acciones sin responsable, sin objetivo o sin fecha':sinAcc.length?sinAcc.length+' causa(s) sin acción que las ataque':'Cada causa tiene su contramedida'});
  const s=r.seguimiento||{};
  const segOk=!!((s.indicador||'').trim()&&(s.meta||'').trim());
  res.push({ok:segOk,t:'Seguimiento definido',d:segOk?'Mide: '+s.indicador+' · Meta: '+s.meta:'Falta qué se va a medir y qué valor confirma la mejora'});
  return res;
}
function renderQualityPanel(checks,title){
  const ok=checks.filter(x=>x.ok).length;
  return `<div class="qp">
    <div class="qp-hd"><span class="qp-title">${esc(title)}</span><span class="qp-score ${ok===checks.length?'ok':'warn'}">${ok}/${checks.length}</span></div>
    ${checks.map(x=>`<div class="qp-row ${x.ok?'ok':'bad'}"><span class="qp-ic">${x.ok?'✓':'✕'}</span><div><div class="qp-t">${esc(x.t)}</div><div class="qp-d">${esc(x.d)}</div></div></div>`).join('')}
  </div>`;
}

// ── Estado de revisión y OCC trabadas ──
function occRaiz(o){return (o&&o.context&&o.context.raiz)||{};}
function occStateLabel(o){
  if(o.status==='closed') return ['closed','Cerrada'];
  const rv=occRaiz(o).review||{};
  if(rv.estado==='pendiente') return ['analysis','En revisión'];
  if(rv.estado==='devuelta') return ['open','Devuelta'];
  if(rv.estado==='aprobada') return ['analysis','En seguimiento'];
  return ['open','Pendiente'];
}
function occStalled(o){
  if(o.status==='closed') return null;
  const r=occRaiz(o), rv=r.review||{};
  if(rv.estado==='pendiente'){const dd=daysSince(rv.fecha);if(dd!==null&&dd>=3)return {dias:dd,txt:'Esperando revisión hace '+dd+' días'};}
  if(rv.estado==='devuelta'){const dd=daysSince(rv.fecha);if(dd!==null&&dd>=3)return {dias:dd,txt:'Devuelta hace '+dd+' días y sin corregir'};}
  const dd=daysSince(r.ultimaActividad||o.date);
  if(dd!==null&&dd>=14) return {dias:dd,txt:'Sin movimiento hace '+dd+' días'};
  const acts=o.actions||[];
  if(!acts.length) return {dias:dd||0,txt:'Sin contramedidas cargadas'};
  if(acts.every(a=>!a.dateExp)) return {dias:dd||0,txt:'Acciones sin fecha'};
  return null;
}
function renderStalledCard(occs){
  const list=occs.map(o=>({o,s:occStalled(o)})).filter(x=>x.s).sort((a,b)=>b.s.dias-a.s.dias);
  return `<div class="db-alert-card ${list.length?'':'ok'}">
    <div class="db-card-hd"><span class="db-card-hd-icon">⏸</span><span class="db-card-hd-title">OCC trabadas</span><span class="db-card-hd-count ${list.length?'':'ok'}">${list.length}</span></div>
    ${list.length===0?`<div style="font-size:13px;color:var(--accent)">Ninguna OCC está trabada.</div>`:list.slice(0,5).map(({o,s})=>`
      <div class="db-alert-row" onclick="openOCCDetail(${o.id})" style="cursor:pointer">
        <div class="db-alert-dot" style="background:var(--orange)"></div>
        <div class="db-alert-body">
          <div class="db-alert-prob">OCC N° ${o.num} — ${esc(o.problem.length>34?o.problem.slice(0,33)+'…':o.problem)}</div>
          <div class="db-alert-meta">${esc(o.responsable)} · ${esc(s.txt)}</div>
        </div>
      </div>`).join('')}
    ${list.length>5?`<div style="font-size:12px;color:var(--text3);padding-top:8px;font-family:var(--fm)">+${list.length-5} más</div>`:''}
  </div>`;
}
function renderLearningsCard(occs){
  const list=occs.filter(o=>o.status==='closed'&&(o.learning||'').trim()).sort((a,b)=>String(occRaiz(b).cerradaFecha||b.date).localeCompare(String(occRaiz(a).cerradaFecha||a.date))).slice(0,5);
  return `<div class="db-learn-card">
    <div class="db-card-hd"><span class="db-card-hd-icon">💡</span><span class="db-card-hd-title">Aprendizajes de la planta</span><span class="db-card-hd-count ok">${list.length}</span></div>
    ${list.length===0?`<div style="font-size:13px;color:var(--text2)">Todavía no hay OCC cerradas con estandarización.</div>`:list.map(o=>`
      <div class="db-learn-row" onclick="openOCCDetail(${o.id})">
        <span class="db-learn-pill">N° ${o.num}</span>
        <div style="min-width:0"><div class="db-learn-text">${esc(o.learning.length>120?o.learning.slice(0,119)+'…':o.learning)}</div>
        <div class="db-learn-meta">${esc(o.problem.length>60?o.problem.slice(0,59)+'…':o.problem)}</div></div>
      </div>`).join('')}
  </div>`;
}

// ── Guardado parcial en Supabase (sin cambiar el esquema: lo nuevo vive en context.raiz) ──
async function patchOCC(id,mutate){
  const occs=getOCCs(); const o=occs.find(x=>x.id===id); if(!o) return false;
  const ctx=JSON.parse(JSON.stringify(o.context||{})); ctx.raiz=ctx.raiz||{};
  const fields={};
  try{ if(mutate(o,ctx.raiz,fields)===false) return false; }catch(e){ console.error(e); return false; }
  ctx.raiz.ultimaActividad=nowISO(); fields.context=ctx;
  let ok=false;
  try{ ok=await SB.update('occs',id,fields); }catch(e){ ok=false; }
  if(!ok){ toast('Error al guardar. Verificá tu conexión.','error'); return false; }
  Object.assign(o,fields); APP._occs=occs.map(x=>x.id===id?o:x);
  return true;
}

// ═══════════════════════════════════════════════════════
// OCC DETAIL — revisión, seguimiento y cierre
// ═══════════════════════════════════════════════════════
function canReviewOCC(){const r=APP.user&&APP.user.role;return r==='admin'||r==='supervisor';}
function isOCCCreator(o){const r=occRaiz(o);return (r.creadoPor&&r.creadoPor===APP.user?.id)||o.createdBy===APP.user?.id;}
function occSostenido(o){
  const r=occRaiz(o); const n=parseInt((r.seguimiento||{}).n)||3; const m=r.mediciones||[];
  const last=m.slice(-n); return {n,ok:last.length>=n&&last.every(x=>x.cumple),seguidas:(()=>{let k=0;for(let i=m.length-1;i>=0&&m[i].cumple;i--)k++;return k;})()};
}

function openOCCDetail(id){
  const o=getOCCs().find(x=>x.id===id); if(!o) return;
  // Se reinvoca tras cada acción (medición, marcar hecha, etc.) y rearma
  // el modal desde cero — sin esto, cada click te mandaba arriba del todo.
  const prevScroll = document.querySelector('#modals .modal')?.scrollTop || 0;
  const tl=t(); const c=o.context||{}; const r=c.raiz||{}; const rv=r.review||{};
  const st=occStateLabel(o);
  const checks=qualityChecks(qualityFromOCC(o)); const allOk=checks.every(x=>x.ok);
  const reviewer=canReviewOCC(); const creator=isOCCCreator(o);
  const isOpen=o.status!=='closed';
  const seg=r.seguimiento||{}; const meds=r.mediciones||[]; const sos=occSostenido(o);
  const impMap={positive:'Causa raíz eliminada',partial:'Mejoró pero el problema persiste',negative:'Sin efecto',unknown:'Sin datos'};
  const chainName=(id)=>{const i=(o.whys||[]).findIndex(w=>w.id===id);if(i<0)return '';const w=o.whys[i];return (w.tipo==='respuesta'?'Duración':'Cadena '+(i+1))+': '+(chainRoot(w)||w.cause);};

  const ctxRows=[
    ['Objeto',c.objeto],['Condición actual',c.condActual],['Condición esperada',c.condEsperada],
    ['Parada',ctxTiempo(c)?ctxTiempo(c)+' min':''],['Cantidad afectada',c.cantidad&&!c.cantidadNA?c.cantidad+' unidades':''],
    ['Contención',c.contencion],['Qué demoró la reposición',c.demora],
  ].filter(x=>x[1]&&String(x[1]).trim());

  const sel=r.selectedCauses||[]; const ver=r.causeVerif||{};
  const causesHtml=sel.map(k=>{const p=k.split(':');const v=ver[p[0]+':'+p[1]]||{};return `<div class="dt-cause"><span class="dt-badge ${v.estado==='verificada'?'ok':'warn'}">${v.estado==='verificada'?'Verificada':'Sin verificar'}</span><div><div>${esc(getCauseVal(k))}</div>${v.dato?`<div class="dt-ev">Dato: ${esc(v.dato)}</div>`:''}</div></div>`;}).join('');

  const chainsHtml=(o.whys||[]).map((w,i)=>{
    const lv=Array.isArray(w.levels)?w.levels:(w.answers||[]).filter(Boolean).map(t=>({text:t}));
    return `<div class="dt-chain">
      <div class="dt-chain-hd">${w.tipo==='respuesta'?'Por qué duró tanto':'Cadena '+(i+1)} · ${esc(w.cause)}</div>
      ${lv.map((l,j)=>`<div class="dt-lvl"><span class="dt-n">${j+1}°</span><div>${esc(l.text)}${l.evidencia?`<div class="dt-ev">Evidencia: ${esc(l.evidencia)}</div>`:''}</div></div>`).join('')}
      ${w.cierre==='gestion'?`<div class="dt-root ok">Causa de gestión: ${esc(chainRoot(w))}</div>`:w.cierre==='tecnica'?`<div class="dt-root warn">Cerrada como causa técnica · observada</div>`:''}
    </div>`;}).join('');

  const actsHtml=(o.actions||[]).map((a,ai)=>`
    <div class="alert-item ${!a.dateFin?'warn':'ok'}" style="margin-bottom:6px">
      <div class="ai-text" style="flex:1">
        <strong>${esc(a.objective)}</strong>
        <span>${esc(a.responsable)} · Fecha esp.: ${esc(a.dateExp||'—')} ${a.dateFin?'· ✓ '+esc(a.dateFin):'· pendiente'}</span>
        ${a.ataca&&chainName(a.ataca)?`<span style="display:block;margin-top:2px;color:var(--text3)">Ataca: ${esc(chainName(a.ataca).slice(0,80))}</span>`:''}
      </div>
      ${!a.dateFin&&isOpen?`<button onclick="markActionDone(${o.id},${ai})" class="dt-mini">✓ Marcar hecha</button>`:''}
    </div>`).join('');

  const medsHtml=meds.length?`<table class="dt-med"><thead><tr><th>Fecha</th><th>Valor</th><th>¿Cumple la meta?</th><th>Cargó</th></tr></thead><tbody>
    ${meds.map(m=>`<tr><td>${esc(fmtDay(m.fecha))}</td><td>${esc(m.valor)}</td><td><span class="dt-badge ${m.cumple?'ok':'bad'}">${m.cumple?'Sí':'No'}</span></td><td>${esc(m.por||'')}</td></tr>`).join('')}
  </tbody></table>`:`<div class="dt-empty">Todavía no hay mediciones.</div>`;

  const histHtml=(rv.historial||[]).slice(-5).reverse().map(h=>`<div class="dt-hist"><span>${esc(fmtDay(h.fecha))}</span> ${esc(h.accion)} · ${esc(h.por)}${h.comentario?`<div class="dt-ev">"${esc(h.comentario)}"</div>`:''}</div>`).join('');

  let reviewState='';
  if(!isOpen) reviewState=`<div class="dt-state ok">OCC cerrada${r.cerradaPor?' por '+esc(r.cerradaPor):''}${r.cerradaFecha?' el '+esc(fmtDay(r.cerradaFecha)):''}</div>`;
  else if(rv.estado==='pendiente') reviewState=`<div class="dt-state info">Esperando revisión desde el ${esc(fmtDay(rv.fecha))}. Enviada por ${esc(rv.enviadaPor||'—')}.</div>`;
  else if(rv.estado==='devuelta') reviewState=`<div class="dt-state bad"><strong>Devuelta por ${esc(rv.devueltaPor||'—')}:</strong> ${esc(rv.comentario||'')}</div>`;
  else if(rv.estado==='aprobada') reviewState=`<div class="dt-state ok">Análisis aprobado por ${esc(rv.aprobadaPor||'—')} el ${esc(fmtDay(rv.fecha))}. Ahora se mide.</div>`;
  else reviewState=`<div class="dt-state">Esta OCC todavía no pasó por revisión.</div>`;

  const showMedForm=isOpen&&rv.estado==='aprobada';
  const showClose=isOpen&&rv.estado==='aprobada'&&reviewer;

  document.getElementById('modals').innerHTML=`
  <div class="overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal" style="max-height:90vh;overflow-y:auto;max-width:760px">
      <div class="modal-title">OCC N° ${o.num} — ${esc(o.problem)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
        <span class="pill ${st[0]}">${st[1]}</span>
        <span style="font-size:12px;color:var(--text2);font-family:var(--fm)">${esc(o.date)} · ${esc(o.responsable)} · ${esc(o.area)}</span>
        ${o.integrantes?`<div style="font-size:11px;color:var(--text3);margin-top:4px;width:100%;font-family:var(--fm)">Equipo: ${esc(o.integrantes)}</div>`:''}
      </div>

      ${ctxRows.length?`<div class="sec-title">Contexto</div><div class="dt-grid">${ctxRows.map(x=>`<div><div class="dt-k">${esc(x[0])}</div><div class="dt-v">${esc(x[1])}</div></div>`).join('')}</div>`:''}
      ${causesHtml?`<div class="sec-title">Causas seleccionadas</div>${causesHtml}`:''}
      ${chainsHtml?`<div class="sec-title">5 Porqués</div>${chainsHtml}`:''}
      ${actsHtml?`<div class="sec-title">Contramedidas</div>${actsHtml}`:''}

      <div class="sec-title">Revisión</div>
      ${reviewState}
      ${renderQualityPanel(checks,'Control del análisis')}
      ${histHtml?`<div class="dt-hist-wrap">${histHtml}</div>`:''}
      ${isOpen&&rv.estado==='pendiente'&&reviewer?`
        <div class="dt-review-box">
          <textarea id="rv-comment" class="why-evidence-input" placeholder="Comentario para el equipo (obligatorio si la devolvés)"></textarea>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="why-confirm-level-btn" style="width:auto;padding:10px 18px" ${allOk?'':'disabled title="Hay puntos del control sin cumplir"'} onclick="approveOCC(${o.id})">✓ Aprobar análisis</button>
            <button class="btn-sec" onclick="returnOCC(${o.id})">Devolver para corregir</button>
          </div>
          ${allOk?'':`<div class="cv-note" style="margin-top:6px">No se puede aprobar mientras haya puntos en rojo. Devolvela indicando qué falta.</div>`}
        </div>`:''}

      ${seg.indicador||meds.length?`<div class="sec-title">Seguimiento</div>
        <div class="dt-grid"><div><div class="dt-k">Indicador</div><div class="dt-v">${esc(seg.indicador||'—')}</div></div><div><div class="dt-k">Meta</div><div class="dt-v">${esc(seg.meta||'—')}</div></div>
        <div><div class="dt-k">Mediciones requeridas</div><div class="dt-v">${sos.n} seguidas · llevás ${sos.seguidas}</div></div></div>
        ${medsHtml}
        ${showMedForm?`<div class="dt-med-form">
          <input type="date" id="med-fecha" class="fi" style="max-width:170px" value="${new Date().toISOString().split('T')[0]}">
          <input type="text" id="med-valor" class="fi" placeholder="Valor medido">
          <select id="med-cumple" class="fi" style="max-width:150px"><option value="">¿Cumple?</option><option value="si">Sí, cumple</option><option value="no">No cumple</option></select>
          <button class="btn-sec" onclick="addMedicion(${o.id})">Registrar</button>
        </div>`:''}`:''}

      ${!isOpen&&o.impact?`<div class="sec-title">Verificación</div>
        <div class="dt-state ${o.impact==='positive'?'ok':'bad'}"><strong>${esc(impMap[o.impact]||o.impact)}</strong>${o.evidencia?`<div style="margin-top:4px">${esc(o.evidencia)}</div>`:''}</div>
        ${o.learning?`<div class="dt-state ok"><strong>Estandarización:</strong> ${esc(o.learning)}</div>`:''}`:''}

      ${showClose?`<div id="close-occ-panel" style="display:none">
        <div class="sec-title">Cerrar OCC</div>
        <div class="dt-close-opts">
          <label class="dt-close-opt"><input type="radio" name="close-res" value="positive" ${sos.ok?'':'disabled'}> <span><strong>Causa eliminada</strong><br><small>${sos.ok?'Se cumplieron '+sos.n+' mediciones seguidas':'Requiere '+sos.n+' mediciones seguidas que cumplan · llevás '+sos.seguidas}</small></span></label>
          <label class="dt-close-opt"><input type="radio" name="close-res" value="partial"> <span><strong>Mejoró pero persiste</strong><br><small>Abrí otra OCC con lo que quedó</small></span></label>
          <label class="dt-close-opt"><input type="radio" name="close-res" value="negative"> <span><strong>Sin efecto</strong><br><small>La causa no era esa: hay que volver a analizar</small></span></label>
        </div>
        <label class="wc-lbl">Evidencia del resultado <span style="color:var(--red)">*</span></label>
        <textarea id="close-evidencia" class="why-evidence-input" placeholder="Qué mostraron las mediciones"></textarea>
        <label class="wc-lbl">Estandarización: qué cambia en el proceso para que no vuelva <span style="color:var(--red)">*</span></label>
        <textarea id="close-learning" class="why-evidence-input" placeholder="Ej: el cambio del acople quedó en el plan preventivo cada 2.000 horas, con repuesto mínimo de 1 en pañol"></textarea>
        <button class="why-confirm-level-btn" style="margin-top:10px" onclick="closeOCCv2(${o.id})">Cerrar OCC</button>
      </div>`:''}

      <div class="modal-actions" style="margin-top:18px">
        <button class="btn-pdf" onclick="exportPDF(${o.id})">📄 ${tl.exportPDF}</button>
        ${isOpen&&(!rv.estado)?`<button class="btn-sec" onclick="submitForReview(${o.id})">Enviar a revisión</button>`:''}
        ${isOpen&&(rv.estado==='devuelta'||!rv.estado||(rv.estado==='pendiente'&&creator))?`<button class="btn-sec" onclick="editOCC(${o.id})">✎ ${rv.estado==='devuelta'?'Corregir análisis':'Editar análisis'}</button>`:''}
        ${showClose?`<button class="btn-sec" onclick="document.getElementById('close-occ-panel').style.display='block';this.style.display='none';document.getElementById('close-occ-panel').scrollIntoView({behavior:'smooth'})">Cerrar OCC</button>`:''}
        ${APP.user?.role==='admin'?`<button onclick="deleteOCC(${o.id})" class="dt-del">🗑 Eliminar</button>`:''}
        <button class="btn-sec" onclick="closeModal()">Cerrar</button>
      </div>
    </div>
  </div>`;
  const modalEl = document.querySelector('#modals .modal');
  if(modalEl) modalEl.scrollTop = prevScroll;
}

async function submitForReview(id){
  const ok=await patchOCC(id,(o,r)=>{const now=nowISO();const h=((r.review&&r.review.historial)||[]).concat([{accion:'enviada a revisión',por:APP.user.name,fecha:now}]);r.review={estado:'pendiente',enviadaPor:APP.user.name,fecha:now,historial:h};});
  if(ok){toast('OCC enviada a revisión','success');openOCCDetail(id);renderContent();}
}
async function approveOCC(id){
  const o=getOCCs().find(x=>x.id===id); if(!o) return;
  if(!qualityChecks(qualityFromOCC(o)).every(x=>x.ok)){toast('Hay puntos del control sin cumplir','warning');return;}
  if(isOCCCreator(o)&&!await raConfirm('Vas a aprobar una OCC que cargaste vos. Lo ideal es que la revise otra persona.\n\n¿Aprobar igual?',{confirmText:'Aprobar igual'})) return;
  const com=(document.getElementById('rv-comment')?.value||'').trim();
  const ok=await patchOCC(id,(o,r)=>{const now=nowISO();const rv=r.review||{};rv.historial=(rv.historial||[]).concat([{accion:'aprobada',por:APP.user.name,fecha:now,comentario:com}]);rv.estado='aprobada';rv.aprobadaPor=APP.user.name;rv.fecha=now;r.review=rv;});
  if(ok){toast('Análisis aprobado. Ahora se mide.','success');openOCCDetail(id);renderContent();}
}
async function returnOCC(id){
  const com=(document.getElementById('rv-comment')?.value||'').trim();
  if(com.length<5){toast('Escribí qué tienen que corregir','warning');document.getElementById('rv-comment')?.focus();return;}
  const ok=await patchOCC(id,(o,r)=>{const now=nowISO();const rv=r.review||{};rv.historial=(rv.historial||[]).concat([{accion:'devuelta',por:APP.user.name,fecha:now,comentario:com}]);rv.estado='devuelta';rv.devueltaPor=APP.user.name;rv.comentario=com;rv.fecha=now;r.review=rv;});
  if(ok){toast('OCC devuelta al equipo','success');openOCCDetail(id);renderContent();}
}
async function addMedicion(id){
  const fecha=document.getElementById('med-fecha')?.value; const valor=(document.getElementById('med-valor')?.value||'').trim(); const cumple=document.getElementById('med-cumple')?.value;
  if(!fecha||!valor||!cumple){toast('Completá fecha, valor y si cumple la meta','warning');return;}
  const ok=await patchOCC(id,(o,r)=>{r.mediciones=(r.mediciones||[]).concat([{fecha,valor,cumple:cumple==='si',por:APP.user.name}]);});
  if(ok){toast('Medición registrada','success');openOCCDetail(id);}
}
async function closeOCCv2(id){
  const sel=document.querySelector('input[name="close-res"]:checked');
  if(!sel){toast('Elegí el resultado','warning');return;}
  const ev=(document.getElementById('close-evidencia')?.value||'').trim();
  const lr=(document.getElementById('close-learning')?.value||'').trim();
  if(ev.length<5){toast('La evidencia del resultado es obligatoria','warning');return;}
  if(lr.length<5){toast('Escribí qué se estandariza para que no vuelva','warning');return;}
  const o=getOCCs().find(x=>x.id===id); if(!o) return;
  if(sel.value==='positive'&&!occSostenido(o).ok){toast('Faltan mediciones seguidas que cumplan la meta','warning');return;}
  const ok=await patchOCC(id,(o,r,f)=>{const now=nowISO();f.status='closed';f.impact=sel.value;f.evidencia=ev;f.learning=lr;r.cerradaPor=APP.user.name;r.cerradaFecha=now;const rv=r.review||{};rv.historial=(rv.historial||[]).concat([{accion:'cerrada',por:APP.user.name,fecha:now}]);r.review=rv;});
  if(ok){closeModal();renderContent();toast(`OCC N° ${o.num} cerrada`,'success');}
}
async function markActionDone(occId,actionIdx){
  const today=new Date().toISOString().split('T')[0];
  const ok=await patchOCC(occId,(o,r,f)=>{const acts=JSON.parse(JSON.stringify(o.actions||[]));if(!acts[actionIdx])return false;acts[actionIdx].dateFin=today;f.actions=acts;});
  if(ok){toast('Acción marcada como completada','success');openOCCDetail(occId);}
}

let _closeImpact = null;
function selectCloseImpact(key){
  _closeImpact = key;
  document.querySelectorAll('#imp-grid-close > div').forEach(el=>{
    el.style.border = '1.5px solid var(--border2)';
    el.style.background = 'transparent';
  });
  const sel = document.getElementById('ci-'+key);
  if(sel){
    sel.style.border = '1.5px solid var(--accent)';
    sel.style.background = 'rgba(0,184,148,.08)';
  }
}

async function confirmCloseOCC(occId){
  if(!_closeImpact){ toast('Seleccioná el resultado de las acciones','warning'); return; }
  const evidencia = document.getElementById('close-evidencia')?.value.trim();
  if(!evidencia){ toast('La evidencia es obligatoria','warning'); return; }
  const learning = document.getElementById('close-learning')?.value.trim()||'';
  const occs = getOCCs();
  const o = occs.find(x=>x.id===occId);
  if(!o) return;
  const updates = {
    status: 'closed',
    impact: _closeImpact,
    evidencia,
    learning,
  };
  try {
    await SB.update('occs', occId, updates);
    Object.assign(o, updates);
    APP._occs = occs.map(x=>x.id===occId?o:x);
    _closeImpact = null;
    closeModal();
    renderContent();
    toast(`OCC N° ${o.num} cerrada correctamente ✓`,'success');
  } catch(e) {
    toast('Error al cerrar OCC','error');
  }
}

function closeModal(){document.getElementById('modals').innerHTML='';}

// Reemplaza al confirm() nativo del navegador (sin estilo, rompe la
// experiencia visual) por un modal propio. Se apila sobre #modals en vez de
// usarlo, para no pisar un modal de detalle que ya esté abierto debajo.
function raConfirm(message, opts={}){
  return new Promise(resolve=>{
    const confirmText = opts.confirmText || 'Confirmar';
    const cancelText = opts.cancelText || 'Cancelar';
    const el = document.createElement('div');
    el.className = 'overlay';
    el.style.zIndex = '10000';
    el.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="ra-confirm-msg">${esc(message)}</div>
        <div class="modal-actions" style="margin-top:18px;justify-content:flex-end">
          <button class="btn-sec" data-act="cancel">${esc(cancelText)}</button>
          <button class="btn-primary ra-confirm-ok${opts.danger?' danger':''}" style="width:auto;margin-top:0" data-act="ok">${esc(confirmText)}</button>
        </div>
      </div>`;
    const finish = (val) => { el.remove(); resolve(val); };
    el.addEventListener('click', e=>{
      if(e.target===el){ finish(false); return; }
      const act = e.target.closest('[data-act]');
      if(act) finish(act.dataset.act==='ok');
    });
    document.body.appendChild(el);
  });
}

async function deleteOCC(id){
  const occs = getOCCs();
  const o = occs.find(x=>x.id===id);
  if(!o) return;
  if(!await raConfirm(`¿Eliminar OCC N° ${o.num} "${o.problem.slice(0,40)}"?\n\nEsta acción no se puede deshacer.`,{confirmText:'Eliminar',danger:true})) return;
  try {
    await SB.delete('occs', id);
    APP._occs = occs.filter(x=>x.id!==id);
    closeModal();
    renderContent();
  } catch(e) {
    toast('Error al eliminar. Verificá tu conexión.', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════
function exportPDF(id){
  const occs=getOCCs();
  const o=occs.find(x=>x.id===id);
  if(!o)return;
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const W=210, ML=16, MR=194, lh=6.5;
  let y=0;

  // ── Color palette — optimized for print on white ──────────────────────────
  const C = {
    black:   [15,  20, 17],   // near-black for primary text
    dark:    [40,  55, 48],   // dark green-grey for secondary text
    mid:     [90, 110,100],   // medium for labels
    light:   [150,165,158],   // light for de-emphasized
    green:   [0,  145,110],   // accent green (darker for print)
    greenBg: [230,248,243],   // very light green bg
    blue:    [37, 99, 235],   // blue for actions
    blueBg:  [235,242,255],   // light blue bg
    red:     [185, 28, 28],   // red for urgent
    orange:  [180, 90,  0],   // orange for warnings
    white:   [255,255,255],
    offwhite:[248,250,249],
    rule:    [210,220,215],   // subtle divider lines
  };

  const fill = (...c) => doc.setFillColor(...c);
  const ink  = (...c) => doc.setTextColor(...c);
  const bold = (size) => { doc.setFont('helvetica','bold'); doc.setFontSize(size); };
  const norm = (size) => { doc.setFont('helvetica','normal'); doc.setFontSize(size); };
  const rect = (x,yw,h,style='F') => doc.rect(x,yw,W-x*2,h,style);
  const rule = (x2=ML-2) => { fill(210,220,215); doc.rect(x2,y,W-x2*2,0.4,'F'); };

  const addText=(txt,indent=0,maxW=null)=>{
    const lines=doc.splitTextToSize(txt,(maxW||MR-ML)-indent);
    doc.text(lines,ML+indent,y);
    y+=lines.length*lh;
    return lines.length;
  };
  const checkPage=()=>{ if(y>272){ doc.addPage(); y=20; } };

  // ── HEADER BAND ───────────────────────────────────────────────────────────
  fill(10, 26, 17); doc.rect(0,0,W,18,'F');                 // dark green band
  fill(0,145,110); doc.rect(0,16,W,2,'F');                 // green accent line
  ink(255,255,255); bold(13);
  doc.text('Raíz',ML,11);
  norm(8); ink(180,220,205);
  doc.text('Root Cause Intelligence',ML+18,11);
  ink(120,180,160); norm(8);
  doc.text(`OCC N° ${o.num}   ·   ${o.date}   ·   ${o.area}`,MR,11,'right');
  y = 26;

  // ── PROBLEM TITLE BLOCK (most important data) ─────────────────────────────
  fill(230,248,243); doc.rect(ML-3, y-5, W-ML*2+6, 20, 'F');
  fill(0,145,110);   doc.rect(ML-3, y-5, 3, 20, 'F');     // left accent bar
  ink(15,20,17); bold(14);
  const titleLines = doc.splitTextToSize(o.problem, MR-ML-6);
  doc.text(titleLines, ML+4, y+1);
  y += titleLines.length * 7 + 4;

  // ── RESPONSIBLE + DATE row (2nd most important) ───────────────────────────
  fill(248,250,249); doc.rect(ML-3, y-1, W-ML*2+6, 12, 'F');
  // Responsible pill
  fill(0,145,110); doc.roundedRect(ML, y+1, 3, 3, 0.5, 0.5, 'F');
  ink(40,55,48); bold(9);
  doc.text('Responsable', ML+6, y+4);
  ink(15,20,17); norm(10);
  doc.text(o.responsable, ML+34, y+4);
  // Date pill
  ink(40,55,48); bold(9);
  doc.text('Fecha', ML+100, y+4);
  ink(15,20,17); norm(10);
  doc.text(o.date||'—', ML+114, y+4);
  // Status badge
  const stColors = {
    'open':[185,28,28], 'closed/positive':[0,130,100],
    'closed/partial':[150,100,0],'analysis':[37,99,235]
  };
  const stLabels = {
    'open':'PENDIENTE','closed/positive':'RESUELTO',
    'closed/partial':'PARCIAL','analysis':'EN ANÁLISIS'
  };
  const stC = stColors[o.status]||[90,90,90];
  fill(...stC,30); // very light tint
  fill(...stC);
  const stLabel = stLabels[o.status]||o.status.toUpperCase();
  const stW = doc.getTextWidth(stLabel)+8;
  doc.roundedRect(MR-stW-2, y, stW+2, 7, 1.5, 1.5, 'F');
  ink(255,255,255); bold(7);
  doc.text(stLabel, MR-stW/2-1, y+4.5, {align:'center'});
  y += 18;

  // ── SECTION HELPER ────────────────────────────────────────────────────────
  const section = (title, accent=C.green) => {
    checkPage();
    y += 4;
    doc.setFillColor(accent[0],accent[1],accent[2]); doc.rect(ML-3, y, 3, 7, 'F');  // left bar
    doc.setTextColor(accent[0],accent[1],accent[2]); bold(8);
    doc.text(title.toUpperCase(), ML+2, y+5);
    fill(210,220,215); doc.rect(ML+doc.getTextWidth(title.toUpperCase())+6, y+3.5, MR-ML-doc.getTextWidth(title.toUpperCase())-6, 0.3, 'F');
    y += 12;
    ink(15,20,17); norm(10);
  };

  // ── PROBLEM DESCRIPTION ───────────────────────────────────────────────────
  section('Formulación del Problema');
  const c=o.context||{};
  const det=Array.isArray(c.deteccion)?c.deteccion.join(', '):(c.deteccion||'');
  const desc=[
    c.objeto      && ['Objeto/proceso afectado', c.objeto],
    c.condActual  && ['Condición actual', c.condActual],
    c.condEsperada&& ['Condición esperada', c.condEsperada],
    det           && ['Cómo se detectó', det],
    (c.cantidad&&!c.cantidadNA) && ['Cantidad afectada', c.cantidad+' unidades'],
    ctxTiempo(c)  && ['Tiempo de parada', ctxTiempo(c)+' min'],
    c.contencion  && ['Contención', c.contencion],
    c.demora      && ['Qué demoró la reposición', c.demora],
  ].filter(Boolean);
  desc.forEach(([lbl,val])=>{
    checkPage();
    ink(90,110,100); bold(8); doc.text(lbl+':', ML+2, y);
    ink(15,20,17); norm(9);
    const lines = doc.splitTextToSize(val, MR-ML-32);
    doc.text(lines, ML+32, y);
    y += Math.max(lines.length * lh, lh) + 2;
  });

  // ── 5 WHYS ────────────────────────────────────────────────────────────────
  if(o.whys&&o.whys.length){
    section('Análisis 5 Porqués');
    o.whys.forEach((w,wi)=>{
      checkPage();
      // Cause header
      fill(240,248,244); doc.rect(ML-1, y-3, MR-ML+2, 8, 'F');
      ink(40,55,48); bold(9);
      doc.text(`Causa ${wi+1}:`, ML+2, y+2);
      ink(15,20,17); norm(9);
      const cLines = doc.splitTextToSize(w.cause, MR-ML-24);
      doc.text(cLines, ML+22, y+2);
      y += Math.max(cLines.length*lh, lh) + 3;
      // Why chain
      w.answers.filter(Boolean).forEach((a,j)=>{
        checkPage();
        // Connector line
        fill(0,145,110); doc.rect(ML+4, y-2, 0.8, lh+1, 'F');
        ink(90,110,100); bold(8);
        doc.text(`${j+1}°`, ML+2, y+2);
        ink(40,55,48); norm(9);
        const aLines = doc.splitTextToSize(a, MR-ML-14);
        doc.text(aLines, ML+10, y+2);
        y += aLines.length*lh + 1.5;
      });
      y += 4;
    });
  }

  // ── ACTIONS (highlighted — important) ────────────────────────────────────
  if(o.actions&&o.actions.length){
    section('Plan de Acción', C.blue);
    o.actions.forEach((a,i)=>{
      checkPage();
      fill(235,242,255); doc.rect(ML-1, y-3, MR-ML+2, 9, 'F');
      fill(37,99,235); doc.rect(ML-1, y-3, 2, 9, 'F');
      ink(37,99,235); bold(9);
      doc.text(`Acción ${i+1}`, ML+4, y+2);
      ink(15,20,17); norm(9);
      const oLines = doc.splitTextToSize(a.objective||'—', MR-ML-28);
      doc.text(oLines, ML+24, y+2);
      y += Math.max(oLines.length*lh, lh) + 2;
      // Responsible + dates row
      ink(90,110,100); bold(8);
      doc.text('Responsable:', ML+4, y);
      ink(15,20,17); norm(9);
      doc.text(a.responsable||'—', ML+28, y);
      ink(90,110,100); bold(8);
      doc.text('Fecha esperada:', ML+90, y);
      ink(15,20,17); norm(9);
      doc.text(a.dateExp||'Pendiente', ML+122, y);
      // Completion status
      const done = !!a.dateFin;
      done ? doc.setFillColor(0,145,110) : doc.setFillColor(180,90,0);
      doc.roundedRect(MR-22, y-3.5, 22, 6, 1, 1, 'F');
      ink(255,255,255); bold(7);
      doc.text(done?'FINALIZADA':'PENDIENTE', MR-11, y+0.5, {align:'center'});
      y += lh + 3;
    });
  }

  // ── RESULT / IMPACT (most important — big visual) ────────────────────────
  if(o.impact){
    section('Resultado', C.green);
    const impConf = {
      positive: { label:'POSITIVO', sub:'Causa raíz eliminada', bg:[220,248,238], bar:[0,145,110], ink:[0,100,75] },
      partial:  { label:'PARCIAL',  sub:'Mejoró pero el problema persiste', bg:[255,247,225], bar:[180,130,0], ink:[150,100,0] },
      negative: { label:'SIN EFECTO', sub:'No se observó cambio', bg:[255,235,235], bar:[185,28,28], ink:[150,20,20] },
      unknown:  { label:'SIN DATOS', sub:'Pendiente de observación', bg:[240,240,245], bar:[100,100,130], ink:[80,80,110] },
    };
    const imp = impConf[o.impact] || impConf.unknown;
    // Big result card
    doc.setFillColor(imp.bg[0],imp.bg[1],imp.bg[2]); doc.rect(ML-3, y-2, W-ML*2+6, 18, 'F');
    doc.setFillColor(imp.bar[0],imp.bar[1],imp.bar[2]); doc.rect(ML-3, y-2, 4, 18, 'F');
    doc.setTextColor(imp.ink[0],imp.ink[1],imp.ink[2]); bold(16);
    doc.text(imp.label, ML+8, y+8);
    ink(40,55,48); norm(10);
    doc.text(imp.sub, ML+8, y+14);
    y += 24;
    // Evidence — important supporting data
    if(o.evidencia){
      checkPage();
      ink(90,110,100); bold(8); doc.text('EVIDENCIA:', ML+2, y);
      ink(15,20,17); norm(10);
      const eLines = doc.splitTextToSize(o.evidencia, MR-ML-28);
      doc.text(eLines, ML+28, y);
      y += eLines.length*lh + 4;
    }
    if(o.learning){
      checkPage();
      fill(230,248,243); doc.rect(ML-1, y-2, MR-ML+2, 10, 'F');
      ink(0,145,110); bold(8); doc.text('ESTANDARIZACIÓN:', ML+2, y+3);
      ink(40,55,48); norm(9);
      const lLines = doc.splitTextToSize(o.learning, MR-ML-44);
      doc.text(lLines, ML+44, y+3);
      y += Math.max(lLines.length*lh, 8) + 4;
    }
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const pages = doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    fill(210,220,215); doc.rect(0,284,W,0.5,'F');
    fill(248,250,249); doc.rect(0,284.5,W,12.5,'F');
    ink(150,165,158); norm(7.5);
    doc.text(`Raíz — Root Cause Intelligence   |   Generado: ${formatDate(new Date())}`,ML,291);
    ink(90,110,100); bold(7.5);
    doc.text(`${i} / ${pages}`,MR,291,'right');
  }

  doc.save(`OCC_${o.num}_${o.problem.slice(0,30).replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
  toast('PDF generado correctamente','success');
}

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
function similarity(a,b){
  a=a.toLowerCase();b=b.toLowerCase();
  const wa=a.split(/\s+/),wb=b.split(/\s+/);
  const common=wa.filter(w=>w.length>3&&wb.includes(w));
  return common.length/Math.max(wa.length,wb.length);
}
function findSimilar(problem){
  if(!problem||problem.length<4)return[];
  return getOCCs().filter(o=>similarity(o.problem,problem)>0.35);
}

let _similarT = null;
function scheduleSimilarOCCCheck(query){
  clearTimeout(_similarT);
  const panel = document.getElementById('similar-occ-panel');
  if(!panel) return;
  if(!query || query.trim().length < 4){ panel.innerHTML = ''; return; }
  _similarT = setTimeout(()=>renderSimilarOCCPanel(query.trim()), 600);
}

function renderSimilarOCCPanel(query){
  const panel = document.getElementById('similar-occ-panel');
  if(!panel) return;
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w=>w.length>2);
  const occs = getOCCs();
  // Match by word overlap against problem title AND causes
  const scored = occs.map(o=>{
    const text = (o.problem + ' ' + (o.integrantes||'') + ' ' + (o.area||'')).toLowerCase();
    const matches = words.filter(w=>text.includes(w));
    return { o, score: matches.length / Math.max(words.length, 1) };
  }).filter(x=>x.score>=0.3).sort((a,b)=>b.score-a.score).slice(0,3);

  if(!scored.length){ panel.innerHTML=''; return; }

  const impMap = {
    positive:['positive','✓ Resuelto'],
    partial:['partial','⚡ Parcial'],
    negative:['negative','✗ Sin efecto'],
    null:['open','⏳ Abierta'],
    undefined:['open','⏳ Abierta'],
  };

  const items = scored.map(({o})=>{
    const imp = impMap[o.impact] || impMap[null];
    const topCause = o.whys&&o.whys.length ? o.whys[0].cause : '—';
    const topWhy = o.whys&&o.whys.length&&o.whys[0].answers ? o.whys[0].answers.filter(Boolean).slice(-1)[0]||'—' : '—';
    return `
    <div class="similar-occ-item" onclick="openOCCDetail(${o.id});return false;">
      <div class="similar-occ-num">N° ${o.num} · ${esc(o.area||'')} · ${esc(o.date||'')}</div>
      <div class="similar-occ-prob">${esc(o.problem)}</div>
      <div class="similar-occ-cause">↳ Causa raíz: <strong>${esc(topCause)}</strong> — ${esc(topWhy)}</div>
      <span class="similar-occ-result ${imp[0]}">${imp[1]}</span>
    </div>`;
  }).join('');

  panel.innerHTML=`
  <div class="similar-occ-wrap">
    <div class="similar-occ-header">⚠ OCCs similares encontradas <span>hacé click para revisar antes de continuar</span></div>
    ${items}
  </div>`;
}
function formatDate(d){return d.toLocaleDateString(APP.lang==='es'?'es-AR':'en-US',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}

function toast(msg,type='success'){
  const c=document.getElementById('toasts');
  const icons={success:'✓',warning:'⚠',error:'✕',info:'ℹ'};
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span>${icons[type]||'●'}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transition='opacity .3s';setTimeout(()=>el.remove(),300);},3500);
}

// ═══════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════
// PWA Install
let _pwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _pwaPrompt = e; renderInstallBanner(); });

// ── Service Worker (offline support) ─────────────────────────
if('serviceWorker' in navigator){
  const swCode = `
const CACHE = 'raiz-v1';
const ASSETS = [location.href];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
    const clone = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, clone));
    return res;
  }).catch(() => cached)));
});
  `;
  const blob = new Blob([swCode], {type:'application/javascript'});
  const swURL = URL.createObjectURL(blob);
  navigator.serviceWorker.register(swURL, {scope:'./'}).catch(()=>{});
}

function renderInstallBanner(){
  const b = document.getElementById('pwa-install-banner');
  if(b && _pwaPrompt) b.style.display = 'flex';
}

async function installPWA(){
  if(!_pwaPrompt) return;
  _pwaPrompt.prompt();
  const r = await _pwaPrompt.userChoice;
  if(r.outcome === 'accepted'){ _pwaPrompt = null; document.getElementById('pwa-install-banner').style.display='none'; toast('¡Raíz instalada en tu dispositivo!','success'); }
}

// ═══════════════════════════════════════════════════════
// BACKUP — Exportar / Importar datos completos
// Solución para uso con archivo local (file://)
// ═══════════════════════════════════════════════════════
function exportBackup(){
  const backup = {
    version: '2.0', app: 'raiz', exportDate: new Date().toISOString(),
    empresa: APP._tenant || null,
    usuarios: (APP._users||[]).map(u=>({id:u.id,name:u.name,email:u.email,role:u.role,area:u.area})),
    occs: APP._occs || [],
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `raiz_respaldo_${(APP._tenant&&APP._tenant.domain)||'empresa'}_${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Respaldo descargado: '+(APP._occs||[]).length+' OCC','success');
}

function importBackup(event){
  if(event && event.target) event.target.value='';
  toast('La restauración de respaldos se hace desde el servidor, para no pisar datos de otros usuarios.','warning');
}

(async function(){
  APP.lang = LS.get('lang')||'es';
  initTheme();
  LS.del('session'); // sesión vieja (sin firma): ya no se usa

  document.addEventListener('click', e => {
    const btn   = e.target.closest('.notif-btn');
    const panel = document.getElementById('notif-panel');
    if(!btn && panel && panel.style.display === 'block'){ panel.style.display = 'none'; APP.notifOpen = false; }
  });

  if(LS.get('token')){
    document.getElementById('root').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px">
        <div style="width:42px;height:42px;background:var(--accent);border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:var(--fh);font-weight:800;font-size:20px;color:#fff">R</div>
        <div style="font-size:13px;color:var(--text2);font-family:var(--fm)">Cargando datos...</div>
      </div>`;
    try {
      await loadTenantData();
      initApp();
      return;
    } catch(e) {
      console.warn('Session restore failed:', e);
      if(e.status===401||e.status===403) LS.del('token');
    }
  }
  renderAuth();
})();
