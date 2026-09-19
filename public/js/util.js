function formatarMoeda(valor, moeda) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(valor);
  } catch {
    return `${moeda || 'BRL'} ${Number(valor).toFixed(2)}`;
  }
}

const STATUS_LABEL = {
  agendado: 'Agendado',
  ao_vivo: 'Ao vivo',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Encerrado',
  sem_lances: 'Encerrado sem lances'
};

function pad(n) { return String(n).padStart(2, '0'); }

function partesContagem(msRestante) {
  const total = Math.max(0, Math.floor(msRestante / 1000));
  return {
    dias: Math.floor(total / 86400),
    horas: Math.floor((total % 86400) / 3600),
    min: Math.floor((total % 3600) / 60),
    seg: total % 60,
    acabou: total <= 0
  };
}

function montarContagemHTML(msRestante) {
  const p = partesContagem(msRestante);
  const blocos = [];
  if (p.dias > 0) blocos.push([pad(p.dias), 'dias']);
  blocos.push([pad(p.horas), 'h'], [pad(p.min), 'min'], [pad(p.seg), 'seg']);
  return blocos
    .map(([valor, rotulo]) => `<div class="unidade"><div class="valor">${valor}</div><div class="rotulo">${rotulo}</div></div>`)
    .join('');
}
