// Todos os valores ajustáveis do jogo ficam aqui.
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

export const CONFIG = {
  VERSION: '0.3.0',
  VERSION_LABEL: 'v0.3 protótipo',
  TITLE: 'PING POW!', // nome provisório, a cliente pode trocar
  DEBUG,
  FONT: 'Jersey 15', // textos no canvas ("POW!"); no CSS, ver @font-face. Grade de 27 px por em.
  PLAYERS: {
    a: { name: 'Jogadora A', color: '#ff5d8f', hair: '#4a2a1a' }, // trocar pelos nomes reais
    b: { name: 'Jogadora B', color: '#4cc9f0', hair: '#1e1726' },
  },
  WIN_MESSAGE: '{nome} venceu! 🏆',
  RULES: {
    pointsToWin: DEBUG ? 3 : 11, winBy: 2, serveEvery: 2,
    serveDelay: 1, serveMaxDeg: 20, pointPause: 0.8,
    finalPause: 1.8, // pausa depois do ponto que fecha a partida (comemoração)
  },
  // px lógicos/s. Saque cruza a mesa em ~1,2 s (com 170 eram ~2 s: "bola lenta" na validação).
  // Teto do smash = 600 × 1,3 = 780 → 3,25 px por passo de 1/240 s, menos que o raio: não atravessa a raquete.
  BALL:   { radius: 4, startSpeed: 300, speedUp: 1.05, maxSpeed: 600, minVyFrac: 0.35 },
  PADDLE: { w: 40, h: 6, maxSpeed: 520, maxBounceDeg: 60, spin: 0.15,
            gap: 20,        // distância da raquete até a ponta da mesa
            outMargin: 26 }, // quanto a bola passa da raquete até virar ponto
  POWERS: { hitsToFill: 5, smashMult: 1.8, smashCapMult: 1.3,
            curveAccel: 220, freezeFactor: 0.35, freezeSecs: 2 },
  CPU: {
    // aim: chance de mirar longe da adversária · aimMax: quanto da ponta da raquete ela arrisca usar
    // miss: chance de "vacilo" por jogada (calcula errado e perde a bola, como gente)
    easy:   { speed: 0.55, errorPx: 18, delay: 0.25, aim: 0.15, aimMax: 0.35, miss: 0.14 },
    normal: { speed: 0.75, errorPx: 10, delay: 0.15, aim: 0.55, aimMax: 0.6,  miss: 0.07 },
    hard:   { speed: 0.95, errorPx: 4,  delay: 0.08, aim: 0.9,  aimMax: 0.8,  miss: 0.025 },
    powerDelay: [0.5, 2],  // s até usar o poder recebido
    returnSpeed: 0.35,     // fração da velocidade ao voltar pro centro
    errorSpeedExp: 2.2,    // erro × (velocidade/inicial)^exp — bola rápida engana mais (2,2 mantém o erro na velocidade máxima de antes)
    rubber: 0.12,          // erro ±12% por ponto de vantagem (até 3): partidas mais disputadas
    demoLevel: 'easy',     // CPU × CPU no fundo do menu
  },
  FX: {
    hitStop: 0.035, smashStop: 0.11, pointStop: 0.07, // pausas de impacto (s)
    shakeHit: 1.2, shakeSmash: 7, shakePoint: 4, shakeFinal: 9, // tremor (px lógicos)
    slowMo: 0.2, slowZoom: 1.3, // câmera lenta + zoom no ponto que fecha a partida
    bounceAt: 0.68,             // fração do caminho em que a bola quica na mesa
    arc: [13, 4],               // altura do arco da bola: lenta → rápida
    rallyEvery: 10,             // aviso a cada N rebatidas seguidas
    confetti: 160,
    overFade: 0.3,              // s pro escurecido da tela de vitória aparecer
  },
  AUDIO: {
    music: 0.28, sfx: 1,              // volume de cada trilha em 100% nos controles
    defaultMusic: 0.8, defaultSfx: 1, // posição inicial dos controles (0 a 1)
    matchPointRate: 1.12,             // música acelera no match point
    // Volume de cada efeito, acertado por loudness (LUFS), não por pico: os jingles 8-bit
    // (onda quadrada contínua) soavam ~13 dB acima da rebatida.
    mix: { hit: 1, bounce: 0.55, wall: 0.45, serve: 0.75, smash: 0.8, point: 0.27, matchPoint: 0.3,
           ready: 0.24, rally: 0.19, fire: 0.43, curve: 0.53, freeze: 0.41, ice: 0.3, lose: 0.34,
           click: 0.5, applause: 1.6, applauseFinal: 2.9 },
  },
  NET: {
    prefix: 'pingpow-',                 // Peer ID do host = prefix + código da sala
    codeLen: 4, codeChars: 'ABCDEFGHJKMNPQRSTUVWXYZ', // só letras, sem O, I e L
    inputRate: 60, snapRate: 30,        // mensagens/s: convidada → host (dedo) e host → convidada (snapshots)
    interpDelay: 0.1,                   // s de buffer da convidada pra interpolar os snapshots
    pingEvery: 1, timeout: 3,           // s entre pings · s sem nenhuma mensagem = conexão caiu
    reconnectSecs: 10, retryEvery: 2,   // s tentando reconectar antes de voltar ao menu · s entre tentativas
    joinTimeout: 12,                    // s pra conseguir entrar numa sala
    // null = padrão do PeerJS (STUN do Google + TURN gratuito do PeerJS). Se o 4G falhar, pôr outro TURN aqui.
    iceServers: null,
  },
  // Sprites (Fase 3): Y dos pés em relação à raquete. De costas = P1 (embaixo), de frente = P2 (em cima).
  SPRITES: { footY: { back: 30, front: -12 } },
  WORLD: { w: 270, h: 480 },
  TABLE: { x: 25, y: 80, w: 220, h: 320 },
  PHYS:  { step: 1 / 240, maxFrame: 0.25 },
  COLORS: {
    bg: '#1d1a3a', floor: '#262150', floor2: '#2b2559', table: '#1f7a5a', tableDark: '#18624a',
    tableLight: '#248a66', line: '#e9fff4', net: '#f4f4f4', netShadow: 'rgba(0,0,0,.3)',
    ball: '#fff6d8', shadow: 'rgba(0,0,0,.35)',
    freeze: '#9fe3ff', fire: '#ff8a1f', fire2: '#ffd23f', fire3: '#ff3d2e', curve: '#c08bff', curve2: '#ff7ad9',
    skin: '#f2c6a0', handle: '#b07040',
    confetti: ['#ff5d8f', '#4cc9f0', '#ffd23f', '#7cf29a', '#c08bff', '#ffffff'],
    overDim: ['rgba(20,16,45,.3)', 'rgba(20,16,45,.86)'], // escurecido da vitória: centro → borda
  },
  TEXTS: {
    tapToPlay: 'Toque para jogar',
    whoAreYou: 'Quem é você?',
    local: '2 Jogadoras', cpu: 'Contra a CPU', online: 'Online',
    easy: 'Fácil', normal: 'Normal', hard: 'Difícil',
    serve: 'Saque: {nome}', point: 'Ponto de {nome}!',
    paused: 'Pausado', resume: 'Continuar', menu: 'Menu', rematch: 'Revanche',
    rotate: 'Gire o celular 📱',
    install: 'Para jogar em tela cheia: Compartilhar → Adicionar à Tela de Início',
    cpuName: 'CPU',
    matchPoint: 'MATCH POINT!',
    rally: '{n} rebatidas seguidas!',
    pow: 'POW!',
    dragHint: 'Arraste o dedo pra mover a raquete',
    powerNames: { smash: '🔥 SMASH DE FOGO!', curve: '🌀 BOLA CURVA!', freeze: '❄️ CONGELOU!' },
    createRoom: 'Criar sala', joinRoom: 'Entrar numa sala', back: 'Voltar', cancel: 'Cancelar', enter: 'Entrar',
    roomCode: 'Manda esse código pra ela:', waiting: 'Aguardando a outra jogadora…', typeCode: 'Digite o código da sala:',
    shareCode: '📤 Mandar o código', copied: 'Código copiado!',
    shareText: 'Bora jogar {titulo}? 🏓 Abre o jogo, toca em Online → Entrar numa sala e digita o código: {codigo}',
    keepOpen: 'Deixa o jogo aberto até ela entrar.',
    codeShort: 'O código tem 4 letras.', connecting: 'Conectando…', connected: 'Conectou! 🎉',
    netServer: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
    netNoRoom: 'Sala não encontrada. Confira o código.',
    netFail: 'Não deu pra conectar. Tente de novo.',
    netVersion: 'Versões diferentes do jogo: fechem e abram o app de novo.',
    netBusy: 'Essa sala já está cheia.',
    netLost: 'A conexão caiu. 😢', netLeft: '{nome} saiu da partida.',
    reconnecting: 'Reconectando…',
    rematchWait: 'Esperando {nome}…', rematchAsk: '{nome} quer revanche!',
    sound: 'Som', music: '🎵 Música', sfx: '💥 Efeitos',
    mute: '🔇 Silenciar tudo', unmute: '🔊 Ligar o som', done: 'Pronto',
  },
};
