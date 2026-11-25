// Todos os valores ajustáveis do jogo ficam aqui.
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

export const CONFIG = {
  VERSION: '0.1.0',
  VERSION_LABEL: 'v0.1 protótipo',
  TITLE: 'PING POW!', // nome provisório, a cliente pode trocar
  DEBUG,
  PLAYERS: {
    a: { name: 'Jogadora A', color: '#ff5d8f' }, // trocar pelos nomes reais
    b: { name: 'Jogadora B', color: '#4cc9f0' },
  },
  WIN_MESSAGE: '{nome} venceu! 🏆',
  RULES: {
    pointsToWin: DEBUG ? 3 : 11, winBy: 2, serveEvery: 2,
    serveDelay: 1, serveMaxDeg: 20, pointPause: 0.8,
  },
  BALL:   { radius: 4, startSpeed: 170, speedUp: 1.05, maxSpeed: 420, minVyFrac: 0.35 }, // px lógicos/s
  PADDLE: { w: 40, h: 6, maxSpeed: 520, maxBounceDeg: 60, spin: 0.15,
            gap: 20,        // distância da raquete até a ponta da mesa
            outMargin: 26 }, // quanto a bola passa da raquete até virar ponto
  POWERS: { hitsToFill: 5, smashMult: 1.8, smashCapMult: 1.3,
            curveAccel: 220, freezeFactor: 0.35, freezeSecs: 2 },
  CPU: {
    easy:   { speed: 0.55, errorPx: 18, delay: 0.25 },
    normal: { speed: 0.75, errorPx: 10, delay: 0.15 },
    hard:   { speed: 0.95, errorPx: 4,  delay: 0.08 },
    powerDelay: [0.5, 2],  // s até usar o poder recebido
    returnSpeed: 0.35,     // fração da velocidade ao voltar pro centro
  },
  WORLD: { w: 270, h: 480 },
  TABLE: { x: 25, y: 80, w: 220, h: 320 },
  PHYS:  { step: 1 / 240, maxFrame: 0.25 },
  COLORS: {
    bg: '#1d1a3a', floor: '#262150', table: '#1f7a5a', tableDark: '#18624a',
    line: '#e9fff4', net: '#f4f4f4', netShadow: 'rgba(0,0,0,.3)',
    ball: '#fff6d8', shadow: 'rgba(0,0,0,.35)',
    freeze: '#9fe3ff', fire: '#ff8a1f', fire2: '#ffd23f', curve: '#c08bff',
    skin: '#f2c6a0',
  },
  TEXTS: {
    tapToPlay: 'Toque para jogar',
    whoAreYou: 'Quem é você?',
    local: '2 Jogadoras', cpu: 'Contra a CPU', online: 'Online',
    soon: 'em breve',
    easy: 'Fácil', normal: 'Normal', hard: 'Difícil',
    serve: 'Saque: {nome}', point: 'Ponto de {nome}!',
    paused: 'Pausado', resume: 'Continuar', menu: 'Menu', rematch: 'Revanche',
    rotate: 'Gire o celular 📱',
    install: 'Para jogar em tela cheia: Compartilhar → Adicionar à Tela de Início',
    cpuName: 'CPU',
  },
};
