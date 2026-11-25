/* ==========================================================
   CS | PAINEL OPERACIONAL
   Arquivo: app.js
   Versão: 2.2.0
   Interface: GitHub Pages
   Backend: Google Apps Script + Bridge.html
   ========================================================== */

'use strict';

/* ==========================================================
   1. CONFIGURAÇÃO
   ========================================================== */

const CS_CONFIG = {
  versao: '2.2.0',

  // URL publicada do Web App do Google Apps Script.
  // Se houver uma nova implantação, atualize este endereço.
  bridgeUrl:
    'https://script.google.com/macros/s/AKfycbw3qP8yAay_Hc5Y6ZZ8LJh-fgNpSXbiyJTJqXaOQ7OYiC36rH2yNm6WDVYrGWpU5JOXSA/exec',

  origem: 'https://cspontoweb-svg.github.io',

  timeout: 30000,

  chaveDevice: 'CS_DEVICE_ID',
  chaveToken: 'CS_ADMIN_TOKEN',
  chaveRecentes: 'CS_REGISTROS_RECENTES'
};


/* ==========================================================
   2. ESTADO GLOBAL
   ========================================================== */

const CS_STATE = {
  iframe: null,
  pronto: false,
  chamadas: new Map(),

  deviceId: null,
  bootstrap: null,

  cameraStream: null,
  cameraAtiva: false,
  leituraEmAndamento: false,

  timerCamera: null,
  ultimoQRCode: '',
  ultimaLeitura: 0,

  registros: [],
  total: 0,
  aprovados: 0,
  negados: 0
};


/* ==========================================================
   3. FUNÇÕES AUXILIARES
   ========================================================== */

function $(id) {
  return document.getElementById(id);
}

function texto(id, valor) {
  const elemento = $(id);

  if (elemento) {
    elemento.textContent =
      valor === undefined || valor === null
        ? ''
        : String(valor);
  }
}

function mostrar(id, visivel = true) {
  const elemento = $(id);

  if (elemento) {
    elemento.hidden = !visivel;
  }
}

function mensagem(id, conteudo, tipo = '') {
  const elemento = $(id);

  if (!elemento) return;

  elemento.textContent = conteudo || '';
  elemento.dataset.tipo = tipo;
  elemento.hidden = !conteudo;
}

function gerarId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'CS-' +
    Date.now() +
    '-' +
    Math.random().toString(36).substring(2, 10);
}

function obterDeviceId() {
  let id = localStorage.getItem(CS_CONFIG.chaveDevice);

  if (!id) {
    id = gerarId();
    localStorage.setItem(CS_CONFIG.chaveDevice, id);
  }

  return id;
}

function normalizarMatricula(valor) {
  return String(valor || '').trim();
}

function escaparHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* ==========================================================
   4. CRIAÇÃO DO IFRAME BRIDGE
   ========================================================== */

function iniciarBridge() {
  return new Promise((resolve, reject) => {

    if (CS_STATE.pronto && CS_STATE.iframe) {
      resolve(true);
      return;
    }

    if (CS_STATE.iframe) {
      const existente = CS_STATE.iframe;

      existente.addEventListener('load', () => {
        CS_STATE.pronto = true;
        resolve(true);
      }, { once: true });

      return;
    }

    const iframe = document.createElement('iframe');

    iframe.id = 'csBridgeFrame';
    iframe.title = 'Comunicação CS';
    iframe.setAttribute('aria-hidden', 'true');

    iframe.style.position = 'absolute';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    iframe.src = CS_CONFIG.bridgeUrl;

    iframe.onload = function () {
      CS_STATE.pronto = true;
      resolve(true);
    };

    iframe.onerror = function () {
      CS_STATE.pronto = false;
      reject(new Error('Não foi possível carregar a comunicação com o servidor.'));
    };

    document.body.appendChild(iframe);

    CS_STATE.iframe = iframe;

    setTimeout(() => {
      if (!CS_STATE.pronto) {
        reject(new Error(
          'Tempo esgotado ao carregar o Bridge. Verifique a implantação do Apps Script.'
        ));
      }
    }, CS_CONFIG.timeout);
  });
}


/* ==========================================================
   5. RECEBIMENTO DAS RESPOSTAS DO BRIDGE
   ========================================================== */

window.addEventListener('message', function (event) {

  if (event.origin !== 'https://script.google.com') return;

  if (!CS_STATE.iframe) return;

  if (event.source !== CS_STATE.iframe.contentWindow) return;

  const resposta = event.data;

  if (!resposta || resposta.channel !== 'CS_BRIDGE_RESULT') {
    return;
  }

  const chamada = CS_STATE.chamadas.get(resposta.id);

  if (!chamada) return;

  clearTimeout(chamada.timeout);

  CS_STATE.chamadas.delete(resposta.id);

  if (resposta.ok) {
    chamada.resolve(resposta.data);
  } else {
    chamada.reject(
      new Error(
        resposta.data && resposta.data.message
          ? resposta.data.message
          : 'Erro na comunicação com o servidor.'
      )
    );
  }
});


/* ==========================================================
   6. CHAMADA CENTRAL AO BACKEND
   ========================================================== */

async function call(metodo, ...args) {

  await iniciarBridge();

  return new Promise((resolve, reject) => {

    const id = gerarId();

    const timeout = setTimeout(() => {

      CS_STATE.chamadas.delete(id);

      reject(new Error(
        'O servidor não respondeu dentro do tempo esperado.'
      ));

    }, CS_CONFIG.timeout);

    CS_STATE.chamadas.set(id, {
      resolve,
      reject,
      timeout
    });

    CS_STATE.iframe.contentWindow.postMessage({

      channel: 'CS_BRIDGE',

      id: id,

      method: metodo,

      args: args

    }, CS_CONFIG.origem);

  });
}

window.call = call;


/* ==========================================================
   7. PREENCHIMENTO DE SELECTS
   ========================================================== */

function options(id, lista, valorSelecionado = '') {

  const elemento = $(id);

  if (!elemento) return;

  elemento.innerHTML = '';

  const primeiraOpcao = document.createElement('option');

  primeiraOpcao.value = '';
  primeiraOpcao.textContent = 'Selecione';

  elemento.appendChild(primeiraOpcao);

  (lista || []).forEach(item => {

    const opcao = document.createElement('option');

    if (typeof item === 'string') {
      opcao.value = item;
      opcao.textContent = item;

    } else {
      opcao.value = item.id ?? item.codigo ?? item.nome ?? '';
      opcao.textContent = item.nome ?? item.descricao ?? item.id ?? '';
    }

    if (String(opcao.value) === String(valorSelecionado)) {
      opcao.selected = true;
    }

    elemento.appendChild(opcao);

  });
}

window.options = options;


/* ==========================================================
   8. INICIALIZAÇÃO DA OPERAÇÃO
   ========================================================== */

async function init() {

  CS_STATE.deviceId = obterDeviceId();

  texto('tabletStatus', 'Conectando...');

  try {

    const dados = await call(
      'apiOperadorBootstrap',
      CS_STATE.deviceId
    );

    if (!dados || dados.ok !== true) {

      texto('tabletStatus', 'Tablet não autorizado');

      mensagem(
        'result',
        dados && dados.message
          ? dados.message
          : 'Não foi possível validar este tablet.',
        'erro'
      );

      return;
    }

    CS_STATE.bootstrap = dados;

    texto('tablet', dados.tablet?.nome || dados.nomeTablet || 'Tablet');
    texto('obra', dados.obra?.nome || dados.nomeObra || 'Obra');
    texto('trecho', dados.frente?.nome || dados.trecho || 'Frente');

    texto('tabletStatus', 'Tablet conectado');

    options('refeicao', dados.refeicoes || []);

    if ($('turno')) {
      options('turno', dados.turnos || []);
    }

    mostrar('cameraPlaceholder', true);

    mensagem(
      'result',
      'Sistema conectado. Pronto para registrar.',
      'sucesso'
    );

    carregarRegistrosLocais();

    atualizarResumo();

  } catch (erro) {

    texto('tabletStatus', 'Sem conexão');

    mensagem(
      'result',
      erro.message,
      'erro'
    );

  }
}

window.init = init;


/* ==========================================================
   9. BUSCA DE COLABORADORES
   ========================================================== */

async function buscarColaborador(matricula) {

  const termo = normalizarMatricula(matricula);

  if (!termo) {
    throw new Error('Informe a matrícula do colaborador.');
  }

  return await call(
    'buscarColaboradores',
    termo
  );
}


/* ==========================================================
   10. REGISTRO DE PASSAGEM
   ========================================================== */

async function registrarPassagem() {

  if (CS_STATE.leituraEmAndamento) return;

  const matricula = normalizarMatricula(
    $('matricula')?.value
  );

  const refeicao = $('refeicao')?.value || '';

  const turno = $('turno')?.value || '';

  if (!matricula) {

    mensagem(
      'result',
      'Informe ou leia a matrícula do colaborador.',
      'erro'
    );

    return;
  }

  if (!refeicao) {

    mensagem(
      'result',
      'Selecione a refeição.',
      'erro'
    );

    return;
  }

  const dados = CS_STATE.bootstrap || {};

  const payload = {

    matricula: matricula,

    refeicao: refeicao,

    obra: dados.obra?.nome || dados.nomeObra || '',

    trecho: dados.frente?.nome || dados.trecho || '',

    tablet: dados.tablet?.nome || dados.nomeTablet || '',

    deviceId: CS_STATE.deviceId,

    turno: turno,

    operador: 'OPERADOR'

  };

  CS_STATE.leituraEmAndamento = true;

  const botao = $('validate');

  if (botao) botao.disabled = true;

  mensagem(
    'result',
    'Registrando passagem...',
    'info'
  );

  try {

    const resposta = await call(
      'registrarPassagem',
      payload
    );

    if (!resposta || resposta.ok !== true) {

      CS_STATE.negados++;

      mensagem(
        'result',
        resposta?.message || 'Passagem não autorizada.',
        'erro'
      );

      atualizarResumo();

      return;
    }

    CS_STATE.aprovados++;
    CS_STATE.total++;

    const registro = {

      matricula: matricula,

      nome: resposta.nome || resposta.colaborador || '',

      refeicao: refeicao,

      dataHora: new Date().toLocaleString('pt-BR'),

      status: 'APROVADO'

    };

    CS_STATE.registros.unshift(registro);

    salvarRegistrosLocais();

    mensagem(
      'result',
      resposta.message || 'Passagem registrada com sucesso.',
      'sucesso'
    );

    texto(
      'lastEntry',
      registro.nome
        ? registro.nome + ' — ' + matricula
        : matricula
    );

    renderRecent();

    atualizarResumo();

    if ($('matricula')) {
      $('matricula').value = '';
    }

  } catch (erro) {

    CS_STATE.negados++;

    mensagem(
      'result',
      erro.message,
      'erro'
    );

    atualizarResumo();

  } finally {

    CS_STATE.leituraEmAndamento = false;

    if (botao) botao.disabled = false;

    if ($('matricula')) {
      $('matricula').focus();
    }

  }
}


/* ==========================================================
   11. REGISTRO DE VISITANTES
   ========================================================== */

async function registrarVisitante(payload) {

  if (!payload || typeof payload !== 'object') {
    throw new Error('Dados do visitante não informados.');
  }

  payload.deviceId = CS_STATE.deviceId;

  return await call(
    'registrarVisitante',
    payload
  );
}

window.registrarVisitante = registrarVisitante;


/* ==========================================================
   12. HISTÓRICO LOCAL DE REGISTROS
   ========================================================== */

function salvarRegistrosLocais() {

  try {

    localStorage.setItem(
      CS_CONFIG.chaveRecentes,
      JSON.stringify(CS_STATE.registros.slice(0, 50))
    );

  } catch (erro) {
    console.warn('Não foi possível salvar o histórico local.', erro);
  }

}

function carregarRegistrosLocais() {

  try {

    const dados = localStorage.getItem(
      CS_CONFIG.chaveRecentes
    );

    CS_STATE.registros = dados
      ? JSON.parse(dados)
      : [];

    if (!Array.isArray(CS_STATE.registros)) {
      CS_STATE.registros = [];
    }

  } catch (erro) {

    CS_STATE.registros = [];

  }

  renderRecent();
}

function renderRecent() {

  const elemento = $('recent');

  if (!elemento) return;

  elemento.innerHTML = '';

  if (!CS_STATE.registros.length) {

    elemento.textContent = 'Nenhum registro nesta sessão.';
    return;

  }

  CS_STATE.registros.slice(0, 20).forEach(registro => {

    const linha = document.createElement('div');

    linha.className = 'recent-item';

    const nome = document.createElement('strong');

    nome.textContent =
      registro.nome || registro.matricula || 'Colaborador';

    const detalhe = document.createElement('span');

    detalhe.textContent =
      (registro.refeicao || '') +
      ' • ' +
      (registro.dataHora || '');

    linha.appendChild(nome);
    linha.appendChild(detalhe);

    elemento.appendChild(linha);

  });

}

window.renderRecent = renderRecent;


/* ==========================================================
   13. INDICADORES DA SESSÃO
   ========================================================== */

function atualizarResumo() {

  texto('kTotal', CS_STATE.total);

  texto('kOk', CS_STATE.aprovados);

  texto('kNo', CS_STATE.negados);

  texto('kActive', CS_STATE.cameraAtiva ? '1' : '0');

  texto('kVisitors', '0');

  const resumo = $('mealSummary');

  if (resumo) {

    resumo.textContent =
      'Aprovados nesta sessão: ' +
      CS_STATE.aprovados +
      ' | Negados: ' +
      CS_STATE.negados;

  }

}


/* ==========================================================
   14. CÂMERA
   ========================================================== */

async function iniciarCamera() {

  if (!navigator.mediaDevices?.getUserMedia) {

    mensagem(
      'result',
      'Este navegador não permite acesso à câmera.',
      'erro'
    );

    return;
  }

  if (CS_STATE.cameraAtiva) return;

  try {

    const stream = await navigator.mediaDevices.getUserMedia({

      video: {
        facingMode: {
          ideal: 'environment'
        }
      },

      audio: false

    });

    CS_STATE.cameraStream = stream;
    CS_STATE.cameraAtiva = true;

    const video = $('video');

    if (video) {

      video.srcObject = stream;

      video.hidden = false;

      await video.play();

    }

    mostrar('cameraPlaceholder', false);

    texto('kActive', '1');

    mensagem(
      'result',
      'Câmera ativada.',
      'sucesso'
    );

    iniciarLeituraQR();

  } catch (erro) {

    CS_STATE.cameraAtiva = false;

    mensagem(
      'result',
      'Não foi possível iniciar a câmera: ' + erro.message,
      'erro'
    );

  }

}

async function pararCamera() {

  if (CS_STATE.timerCamera) {

    clearInterval(CS_STATE.timerCamera);

    CS_STATE.timerCamera = null;

  }

  if (CS_STATE.cameraStream) {

    CS_STATE.cameraStream.getTracks().forEach(track => {
      track.stop();
    });

  }

  CS_STATE.cameraStream = null;

  CS_STATE.cameraAtiva = false;

  const video = $('video');

  if (video) {

    video.pause();

    video.srcObject = null;

    video.hidden = true;

  }

  mostrar('cameraPlaceholder', true);

  texto('kActive', '0');

  mensagem(
    'result',
    'Câmera desligada.',
    'info'
  );

  atualizarResumo();

}

window.iniciarCamera = iniciarCamera;
window.pararCamera = pararCamera;


/* ==========================================================
   15. LEITURA DE QR CODE
   ========================================================== */

function iniciarLeituraQR() {

  const video = $('video');

  if (!video) return;

  if (!('BarcodeDetector' in window)) {

    mensagem(
      'result',
      'Leitor automático não disponível neste navegador. Digite a matrícula manualmente.',
      'info'
    );

    return;
  }

  let detector;

  try {

    detector = new BarcodeDetector({
      formats: ['qr_code']
    });

  } catch (erro) {

    mensagem(
      'result',
      'Não foi possível inicializar o leitor de QR Code.',
      'erro'
    );

    return;

  }

  if (CS_STATE.timerCamera) {
    clearInterval(CS_STATE.timerCamera);
  }

  CS_STATE.timerCamera = setInterval(async () => {

    if (
      !CS_STATE.cameraAtiva ||
      !video ||
      video.readyState < 2 ||
      CS_STATE.leituraEmAndamento
    ) {
      return;
    }

    try {

      const codigos = await detector.detect(video);

      if (!codigos || !codigos.length) return;

      const valor = String(codigos[0].rawValue || '').trim();

      if (!valor) return;

      const agora = Date.now();

      if (
        valor === CS_STATE.ultimoQRCode &&
        agora - CS_STATE.ultimaLeitura < 3000
      ) {
        return;
      }

      CS_STATE.ultimoQRCode = valor;
      CS_STATE.ultimaLeitura = agora;

      const campo = $('matricula');

      if (campo) {
        campo.value = valor;
      }

      await registrarPassagem();

      // A câmera permanece ligada para a próxima leitura.

    } catch (erro) {

      console.warn('Erro na leitura do QR Code:', erro);

    }

  }, 500);

}


/* ==========================================================
   16. ADMINISTRAÇÃO
   ========================================================== */

async function loginAdmin(email, pin) {

  const resposta = await call(
    'loginAdmin',
    email,
    pin
  );

  if (resposta && resposta.ok && resposta.token) {

    sessionStorage.setItem(
      CS_CONFIG.chaveToken,
      resposta.token
    );

  }

  return resposta;
}

async function logoutAdmin() {

  const token = sessionStorage.getItem(
    CS_CONFIG.chaveToken
  );

  try {

    if (token) {
      await call('logoutAdmin', token);
    }

  } finally {

    sessionStorage.removeItem(
      CS_CONFIG.chaveToken
    );

  }

}

async function carregarAdmin() {

  const token = sessionStorage.getItem(
    CS_CONFIG.chaveToken
  );

  if (!token) {
    throw new Error('Sessão administrativa não encontrada.');
  }

  return await call(
    'apiAdminBootstrap',
    token
  );

}

async function salvarTablet(config) {

  const token = sessionStorage.getItem(
    CS_CONFIG.chaveToken
  );

  if (!token) {
    throw new Error('Acesso administrativo necessário.');
  }

  return await call(
    'salvarConfiguracaoTablet',
    token,
    config
  );

}

async function alterarStatusTablet(deviceId, status) {

  const token = sessionStorage.getItem(
    CS_CONFIG.chaveToken
  );

  if (!token) {
    throw new Error('Acesso administrativo necessário.');
  }

  return await call(
    'alterarStatusTablet',
    token,
    deviceId,
    status
  );

}


/* ==========================================================
   17. INDICADORES E RELATÓRIOS
   ========================================================== */

async function carregarIndicadores(filtros = {}) {

  const token = sessionStorage.getItem(
    CS_CONFIG.chaveToken
  );

  if (!token) {
    throw new Error('Acesso administrativo necessário.');
  }

  return await call(
    'obterIndicadores',
    filtros,
    token
  );

}

async function gerarRelatorio(filtros = {}) {

  const token = sessionStorage.getItem(
    CS_CONFIG.chaveToken
  );

  if (!token) {
    throw new Error('Acesso administrativo necessário.');
  }

  return await call(
    'gerarRelatorio',
    filtros,
    token
  );

}

async function obterListaColaboradores(termo = '') {

  const token = sessionStorage.getItem(
    CS_CONFIG.chaveToken
  );

  if (!token) {
    throw new Error('Acesso administrativo necessário.');
  }

  return await call(
    'obterListaColaboradores',
    token,
    termo
  );

}


/* ==========================================================
   18. DISPONIBILIZAÇÃO GLOBAL
   ========================================================== */

window.CS = {

  config: CS_CONFIG,

  state: CS_STATE,

  call,

  init,

  buscarColaborador,

  registrarPassagem,

  registrarVisitante,

  iniciarCamera,

  pararCamera,

  loginAdmin,

  logoutAdmin,

  carregarAdmin,

  salvarTablet,

  alterarStatusTablet,

  carregarIndicadores,

  gerarRelatorio,

  obterListaColaboradores

};


/* ==========================================================
   19. EVENTOS DA TELA OPERACIONAL
   ========================================================== */

document.addEventListener('DOMContentLoaded', function () {

  const botaoValidar = $('validate');

  if (botaoValidar) {
    botaoValidar.addEventListener('click', registrarPassagem);
  }

  const botaoCamera = $('startCamera');

  if (botaoCamera) {
    botaoCamera.addEventListener('click', iniciarCamera);
  }

  const botaoParar = $('stopCamera');

  if (botaoParar) {
    botaoParar.addEventListener('click', pararCamera);
  }

  const campoMatricula = $('matricula');

  if (campoMatricula) {

    campoMatricula.addEventListener('keydown', function (event) {

      if (event.key === 'Enter') {

        event.preventDefault();

        registrarPassagem();

      }

    });

  }

  // Inicializa automaticamente somente a tela operacional.
  if ($('matricula') || $('validate')) {
    init();
  }

});


/* ==========================================================
   FIM DO ARQUIVO
   ========================================================== */