// Personajes elegibles. Se pueden repetir: dos compañeros pueden ser la misma rana.
export const PERSONAJES = [
  { id: 'rana', nombre: 'Rana Turbo', emoji: '🐸', color: '#35d04a' },
  { id: 'gato', nombre: 'Michi Veloz', emoji: '🐱', color: '#ff9f1c' },
  { id: 'perro', nombre: 'Firulais', emoji: '🐶', color: '#b9773a' },
  { id: 'zorro', nombre: 'Zorro Zas', emoji: '🦊', color: '#ff5a36' },
  { id: 'panda', nombre: 'Panda Pum', emoji: '🐼', color: '#f2f2f2' },
  { id: 'mono', nombre: 'Chango Loco', emoji: '🐵', color: '#9b5b34' },
  { id: 'tigre', nombre: 'Tigre Trueno', emoji: '🐯', color: '#ffc21a' },
  { id: 'conejo', nombre: 'Coneja Flash', emoji: '🐰', color: '#ff8fd0' },
  { id: 'pinguino', nombre: 'Pingu Hielo', emoji: '🐧', color: '#3a9dff' },
  { id: 'unicornio', nombre: 'Unicornio Arcoíris', emoji: '🦄', color: '#b26cff' },
  { id: 'pulpo', nombre: 'Pulpo Pulpín', emoji: '🐙', color: '#ff4f7b' },
  { id: 'dino', nombre: 'Dino Rex', emoji: '🦖', color: '#2fc7a8' },
];

export function personaje(id) {
  return PERSONAJES.find((p) => p.id === id) ?? PERSONAJES[0];
}

export const NOMBRES_BOT = ['Robotín', 'Chispita', 'Tuerca', 'Bip-Bop', 'Pistón', 'Rayito', 'Tornillo', 'Volt', 'Chatarra'];
