// Lógica do 3MF: ler o ZIP, extrair as configurações do Bambu Studio, validar as alterações e gravar o arquivo novo.
// Não depende de nenhuma biblioteca (ZIP próprio sobre CompressionStream/DecompressionStream).
'use strict';
const CFG_PATH = 'Metadata/project_settings.config';
const MS_PATH = 'Metadata/model_settings.config';
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

/* ---------- ZIP mínimo (leitura, cópia sem recompressão e escrita) ---------- */
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
async function pipeThrough(u8, transform) {
  const stream = new Blob([u8]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const inflateRaw = u8 => pipeThrough(u8, new DecompressionStream('deflate-raw'));
const deflateRaw = u8 => pipeThrough(u8, new CompressionStream('deflate-raw'));

function openZip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('sem fim de diretório ZIP');
  const total = dv.getUint16(eocd + 10, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (total === 0xFFFF || cdOff === 0xFFFFFFFF) throw new Error('ZIP64 não suportado');
  const entries = [];
  let p = cdOff;
  for (let i = 0; i < total; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('diretório ZIP inválido');
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const nameBytes = u8.slice(p + 46, p + 46 + nl);
    entries.push({
      flags: dv.getUint16(p + 8, true),
      method: dv.getUint16(p + 10, true),
      time: dv.getUint16(p + 12, true),
      date: dv.getUint16(p + 14, true),
      crc: dv.getUint32(p + 16, true),
      csize: dv.getUint32(p + 20, true),
      usize: dv.getUint32(p + 24, true),
      offset: dv.getUint32(p + 42, true),
      nameBytes,
      name: dec.decode(nameBytes)
    });
    p += 46 + nl + xl + cl;
  }
  return { u8, dv, entries };
}
function rawData(z, e) {
  const o = e.offset;
  if (z.dv.getUint32(o, true) !== 0x04034b50) throw new Error('cabeçalho local inválido');
  const start = o + 30 + z.dv.getUint16(o + 26, true) + z.dv.getUint16(o + 28, true);
  return z.u8.subarray(start, start + e.csize);
}
async function readEntry(z, e) {
  const raw = rawData(z, e);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  throw new Error('compressão ' + e.method + ' não suportada');
}
const findEntry = (z, name) => z.entries.find(e => e.name === name);

async function newItem(nameBytes, text, orig) {
  const data = enc.encode(text);
  const crc = crc32(data);
  let method = 8, comp;
  try { comp = await deflateRaw(data); } catch (_) { comp = data; method = 0; }
  if (comp.length >= data.length) { comp = data; method = 0; }
  return {
    nameBytes, flags: 0x0800, method,
    time: orig ? orig.time : 0, date: orig ? orig.date : 0x0021,
    crc, csize: comp.length, usize: data.length, data: comp
  };
}
function writeZip(items) {
  const parts = [], cd = [];
  let off = 0;
  for (const it of items) {
    const n = it.nameBytes.length;
    const lh = new Uint8Array(30 + n), v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, it.flags, true);
    v.setUint16(8, it.method, true); v.setUint16(10, it.time, true); v.setUint16(12, it.date, true);
    v.setUint32(14, it.crc, true); v.setUint32(18, it.csize, true); v.setUint32(22, it.usize, true);
    v.setUint16(26, n, true); v.setUint16(28, 0, true);
    lh.set(it.nameBytes, 30);
    parts.push(lh, it.data);
    const ch = new Uint8Array(46 + n), c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint16(8, it.flags, true); c.setUint16(10, it.method, true);
    c.setUint16(12, it.time, true); c.setUint16(14, it.date, true);
    c.setUint32(16, it.crc, true); c.setUint32(20, it.csize, true); c.setUint32(24, it.usize, true);
    c.setUint16(28, n, true); c.setUint32(42, off, true);
    ch.set(it.nameBytes, 46);
    cd.push(ch);
    off += lh.length + it.data.length;
  }
  const cdSize = cd.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, items.length, true); e.setUint16(10, items.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return [...parts, ...cd, end];
}

/* ---------- Configurações que o app sabe alterar ---------- */
const GROUPS = ['Qualidade', 'Resistência', 'Suporte', 'Aderência', 'Velocidade', 'Temperatura', 'Resfriamento', 'Multicor'];
const PATTERNS = ['grid', 'gyroid', 'honeycomb', 'cubic', 'adaptivecubic', 'supportcubic', 'line', 'rectilinear', 'alignedrectilinear', 'triangles', 'tri-hexagon', 'lightning', '3dhoneycomb', 'concentric', 'hilbertcurve', 'archimedeanchords', 'octagramspiral', 'crosshatch', 'zig-zag'];
const S = {};
function def(key, label, group, type, o) { S[key] = Object.assign({ key, label, group, type }, o || {}); }
def('layer_height', 'Altura de camada', 'Qualidade', 'num', { min: 0.05, max: 0.32, unit: ' mm' });
def('initial_layer_print_height', 'Altura da primeira camada', 'Qualidade', 'num', { min: 0.08, max: 0.4, unit: ' mm' });
def('wall_generator', 'Gerador de paredes', 'Qualidade', 'enum', { list: ['classic', 'arachne'] });
def('seam_position', 'Posição da costura', 'Qualidade', 'enum', { list: ['nearest', 'aligned', 'back', 'random'] });
def('top_surface_pattern', 'Padrão da superfície superior', 'Qualidade', 'enum', { list: ['monotonic', 'monotonicline', 'alignedrectilinear', 'concentric', 'hilbertcurve', 'archimedeanchords', 'octagramspiral'] });
def('ironing_type', 'Passar ferro (ironing)', 'Qualidade', 'enum', { list: ['no ironing', 'top', 'topmost', 'solid'] });
def('elefant_foot_compensation', 'Compensação de pé de elefante', 'Qualidade', 'num', { min: 0, max: 2, unit: ' mm' });
def('detect_thin_wall', 'Detectar paredes finas', 'Qualidade', 'bool');
def('wall_loops', 'Quantidade de paredes', 'Resistência', 'int', { min: 1, max: 12 });
def('top_shell_layers', 'Camadas do topo', 'Resistência', 'int', { min: 0, max: 30 });
def('bottom_shell_layers', 'Camadas da base', 'Resistência', 'int', { min: 0, max: 30 });
def('sparse_infill_density', 'Densidade do preenchimento', 'Resistência', 'pct', { min: 0, max: 100 });
def('sparse_infill_pattern', 'Padrão do preenchimento', 'Resistência', 'enum', { list: PATTERNS });
def('only_one_wall_top', 'Uma parede só no topo', 'Resistência', 'bool'); // nome antigo, só em projetos de versões velhas
def('top_one_wall_type', 'Uma parede só no topo', 'Qualidade', 'enum', { list: ['not apply', 'all top', 'topmost'] });
def('enable_support', 'Suporte ligado', 'Suporte', 'bool');
def('support_type', 'Tipo de suporte', 'Suporte', 'enum', { list: ['normal(auto)', 'tree(auto)', 'normal(manual)', 'tree(manual)'] });
def('support_style', 'Estilo do suporte', 'Suporte', 'enum', { list: ['default', 'grid', 'snug', 'tree_slim', 'tree_strong', 'tree_hybrid', 'tree_organic'] });
def('support_threshold_angle', 'Ângulo de suporte', 'Suporte', 'int', { min: 0, max: 90, unit: '°' });
def('support_on_build_plate_only', 'Suporte só a partir da mesa', 'Suporte', 'bool');
def('support_top_z_distance', 'Distância vertical do suporte', 'Suporte', 'num', { min: 0, max: 1, unit: ' mm' });
def('brim_type', 'Tipo de brim', 'Aderência', 'enum', { list: ['auto_brim', 'brim_ears', 'outer_only', 'inner_only', 'outer_and_inner', 'no_brim'] });
def('brim_width', 'Largura do brim', 'Aderência', 'num', { min: 0, max: 30, unit: ' mm' });
def('skirt_loops', 'Voltas da saia', 'Aderência', 'int', { min: 0, max: 10 });
['initial_layer_speed:Velocidade da primeira camada', 'outer_wall_speed:Velocidade da parede externa', 'inner_wall_speed:Velocidade das paredes internas',
 'sparse_infill_speed:Velocidade do preenchimento', 'internal_solid_infill_speed:Velocidade do preenchimento sólido', 'top_surface_speed:Velocidade da superfície superior',
 'support_speed:Velocidade do suporte', 'bridge_speed:Velocidade de ponte', 'travel_speed:Velocidade de deslocamento'
].forEach(s => { const [k, l] = s.split(':'); def(k, l, 'Velocidade', 'num', { min: 5, max: 500, unit: ' mm/s' }); });
def('default_acceleration', 'Aceleração padrão', 'Velocidade', 'num', { min: 100, max: 20000, unit: ' mm/s²' });
def('nozzle_temperature', 'Temperatura do bico', 'Temperatura', 'int', { min: 160, max: 300, unit: ' °C' });
def('nozzle_temperature_initial_layer', 'Temperatura do bico (1ª camada)', 'Temperatura', 'int', { min: 160, max: 300, unit: ' °C' });
['hot_plate_temp:Mesa lisa', 'hot_plate_temp_initial_layer:Mesa lisa (1ª camada)', 'textured_plate_temp:Mesa texturizada', 'textured_plate_temp_initial_layer:Mesa texturizada (1ª camada)',
 'cool_plate_temp:Mesa fria', 'cool_plate_temp_initial_layer:Mesa fria (1ª camada)', 'eng_plate_temp:Mesa engenharia', 'eng_plate_temp_initial_layer:Mesa engenharia (1ª camada)'
].forEach(s => { const [k, l] = s.split(':'); def(k, 'Temperatura da ' + l.charAt(0).toLowerCase() + l.slice(1), 'Temperatura', 'int', { min: 0, max: 120, unit: ' °C' }); });
def('fan_min_speed', 'Ventoinha mínima', 'Resfriamento', 'int', { min: 0, max: 100, unit: '%' });
def('fan_max_speed', 'Ventoinha máxima', 'Resfriamento', 'int', { min: 0, max: 100, unit: '%' });
def('overhang_fan_speed', 'Ventoinha em overhang', 'Resfriamento', 'int', { min: 0, max: 100, unit: '%' });
def('close_fan_the_first_x_layers', 'Ventoinha desligada nas primeiras camadas', 'Resfriamento', 'int', { min: 0, max: 20 });
def('slow_down_layer_time', 'Tempo mínimo por camada', 'Resfriamento', 'int', { min: 0, max: 60, unit: ' s' });
def('filament_max_volumetric_speed', 'Vazão máxima do filamento', 'Resfriamento', 'num', { min: 1, max: 40, unit: ' mm³/s' });
def('enable_prime_tower', 'Torre de limpeza (prime tower)', 'Multicor', 'bool');
def('prime_tower_width', 'Largura da torre de limpeza', 'Multicor', 'num', { min: 10, max: 100, unit: ' mm' });

function coerceOne(spec, v) {
  const t = spec.type;
  if (t === 'bool') {
    const s = String(v).trim().toLowerCase();
    if (['1', 'true', 'sim', 'on'].includes(s)) return '1';
    if (['0', 'false', 'nao', 'não', 'off'].includes(s)) return '0';
    throw new Error('"' + v + '" não é ligado/desligado (use 1 ou 0)');
  }
  if (t === 'enum') {
    const s = String(v).trim();
    const hit = spec.list.find(x => x.toLowerCase() === s.toLowerCase());
    if (!hit) throw new Error('"' + s + '" não é aceito aqui. Opções: ' + spec.list.join(', '));
    return hit;
  }
  const raw = String(v).trim().replace('%', '').replace(',', '.');
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n)) throw new Error('"' + v + '" não é um número');
  if (t === 'int' && !Number.isInteger(n)) throw new Error('"' + v + '" precisa ser inteiro');
  if (n < spec.min || n > spec.max) throw new Error(n + ' fica fora do limite seguro (' + spec.min + ' a ' + spec.max + ')');
  if (t === 'pct') return n + '%';
  return String(+n.toFixed(4));
}
function coerce(spec, raw, before) {
  if (Array.isArray(before)) {
    const vals = Array.isArray(raw) ? raw : Array(before.length).fill(raw);
    if (vals.length !== before.length) throw new Error('Esta configuração é por filamento e precisa de ' + before.length + ' valores (ou um só para todos)');
    return vals.map(x => coerceOne(spec, x));
  }
  if (Array.isArray(raw)) throw new Error('Esta configuração recebe um único valor');
  return coerceOne(spec, raw);
}
function fmtVal(spec, v) {
  const unit = spec && spec.unit ? spec.unit : '';
  const one = x => String(x) + (/%$/.test(String(x)) ? '' : unit);
  if (Array.isArray(v)) {
    if (v.every(x => x === v[0])) return one(v[0]) + (v.length > 1 ? '  (×' + v.length + ' filamentos)' : '');
    return v.map(one).join(' | ');
  }
  return one(v);
}
const sameVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- Projeto ---------- */
const xmlText = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const META_RE = '<metadata\\s+(?:type="[^"]*"\\s+)?key="([^"]*)"\\s+value="([^"]*)"\\s*\\/>';
function parseObjects(xml) {
  const out = [];
  const re = /<object\b[^>]*>([\s\S]*?)<\/object>/g;
  let m;
  while ((m = re.exec(xml))) {
    const mre = new RegExp(META_RE, 'g');
    let name = '', k;
    const overrides = new Set();
    while ((k = mre.exec(m[1]))) {
      if (k[1] === 'name' && !name) name = xmlText(k[2]);
      if (S[k[1]]) overrides.add(k[1]);
    }
    out.push({ name: name || 'Objeto ' + (out.length + 1), overrides: [...overrides] });
  }
  return out;
}
function stripOverrides(xml, keys) {
  const re = new RegExp('[ \\t]*' + META_RE + '[ \\t]*\\r?\\n?', 'g');
  return xml.replace(re, (all, k) => (keys.has(k) ? '' : all));
}
async function openProject(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador é antigo demais para ler o 3MF. Use uma versão recente do Chrome, Edge, Firefox ou Safari.');
  let zip;
  try { zip = openZip(buf); } catch (e) { throw new Error('O arquivo não abriu como 3MF (' + e.message + ').'); }
  const cfgE = findEntry(zip, CFG_PATH);
  if (!cfgE) throw new Error('Este 3MF não traz as configurações do Bambu Studio (Metadata/project_settings.config). Abra a peça no Bambu Studio, use Arquivo > Salvar projeto como e envie esse arquivo.');
  let cfg;
  try { cfg = JSON.parse(dec.decode(await readEntry(zip, cfgE))); } catch (_) { throw new Error('Não consegui ler as configurações do projeto: o formato é diferente do esperado.'); }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('Não consegui ler as configurações do projeto: o formato é diferente do esperado.');
  const msE = findEntry(zip, MS_PATH);
  const modelXml = msE ? dec.decode(await readEntry(zip, msE)) : '';
  let app = '';
  const mm = findEntry(zip, '3D/3dmodel.model');
  if (mm && mm.usize < 30e6) {
    const head = dec.decode((await readEntry(zip, mm)).subarray(0, 8000));
    const a = head.match(/name="Application">([^<]+)</);
    if (a) app = xmlText(a[1]);
  }
  return {
    zip, cfg, modelXml, app,
    objects: parseObjects(modelXml),
    plates: (modelXml.match(/<plate>/g) || []).length,
    sliced: zip.entries.some(e => /^Metadata\/plate_\d+\.gcode$/.test(e.name))
  };
}
function detect(p) {
  const c = p.cfg;
  const nz = Array.isArray(c.nozzle_diameter) ? c.nozzle_diameter[0] : c.nozzle_diameter;
  return {
    printer: String(c.printer_model || c.printer_settings_id || ''),
    nozzle: nz ? String(Number(nz)) : '',
    types: Array.isArray(c.filament_type) ? c.filament_type : (c.filament_type ? [c.filament_type] : []),
    names: Array.isArray(c.filament_settings_id) ? c.filament_settings_id : [],
    colours: Array.isArray(c.filament_colour) ? c.filament_colour : []
  };
}

/* ---------- Resumo para o Claude ---------- */
function filamentLabel(f) {
  if (!f.brand) return f.filType;
  if (f.brand === 'Outros') return f.filType + ' (marca não listada: use um perfil genérico e conservador)';
  return f.filType + ' ' + f.brand;
}
function buildSummary(p, f, fileName) {
  const d = detect(p), L = [];
  L.push('Preciso ajustar as configurações de um projeto do Bambu Studio antes de fatiar.');
  L.push('');
  L.push('Impressora: ' + f.printer + ' | bico ' + f.nozzle + ' mm | ' + f.ams);
  L.push('Filamento: ' + filamentLabel(f));
  L.push('Uso da peça: ' + f.use);
  L.push('Prioridade: ' + f.prio);
  if (f.notes) L.push('Observações: ' + f.notes);
  L.push('');
  L.push('Projeto: ' + (fileName || 'sem nome') + (p.app ? ' | ' + p.app : '') + ' | ' + (p.plates || 1) + ' placa(s) | ' + p.objects.length + ' objeto(s)');
  if (p.objects.length) L.push('Objetos: ' + p.objects.slice(0, 12).map(o => o.name).join(', ') + (p.objects.length > 12 ? ' ...' : ''));
  if (d.types.length) L.push('Filamentos no projeto (' + d.types.length + '): ' + d.types.map((t, i) => t + (d.colours[i] ? ' ' + d.colours[i] : '')).join(', '));
  const ov = p.objects.filter(o => o.overrides.length);
  if (ov.length) L.push('Objetos com ajuste próprio: ' + ov.map(o => o.name + ' (' + o.overrides.join(', ') + ')').join('; '));
  L.push('');
  L.push('Configurações atuais (chave = valor):');
  for (const g of GROUPS) {
    const keys = Object.keys(S).filter(k => S[k].group === g && k in p.cfg);
    if (!keys.length) continue;
    L.push('# ' + g);
    for (const k of keys) {
      const v = p.cfg[k];
      L.push(k + ' = ' + (Array.isArray(v) ? '[' + v.join(', ') + '] (por filamento)' : v));
    }
  }
  L.push('');
  L.push('Se precisar, pesquise as recomendações do fabricante do filamento e as especificações da impressora antes de responder.');
  L.push('Responda SOMENTE com um bloco de código JSON neste formato:');
  L.push('{"resumo":"uma frase","alteracoes":[{"chave":"layer_height","valor":"0.16","motivo":"explicação curta"}]}');
  L.push('Regras: use apenas chaves da lista acima; mantenha o mesmo formato de valor (ex.: "15%" para densidade); numa chave por filamento, um valor único vale para todos os filamentos; liste só o que realmente deve mudar.');
  return L.join('\n');
}

/* ---------- Resposta do Claude ---------- */
function extractJson(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Cole a resposta do Claude primeiro.');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const s = fence ? fence[1].trim() : t;
  try { return JSON.parse(s); } catch (_) { /* tenta recortar */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Não encontrei um bloco JSON no texto colado.');
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { throw new Error('O JSON colado tem erro de formato (' + e.message + '). Peça ao Claude para responder de novo só com o bloco JSON.'); }
}
function evaluateChanges(p, data) {
  const list = Array.isArray(data) ? data : (data && (data.alteracoes || data.changes));
  if (!Array.isArray(list)) throw new Error('O JSON não tem a lista "alteracoes".');
  return list.map(it => {
    const key = String((it && (it.chave ?? it.key)) ?? '').trim();
    const spec = S[key];
    const r = { key, spec, reason: String((it && (it.motivo ?? it.reason)) ?? ''), before: p.cfg[key], after: null, status: 'bad', msg: '', conflicts: [] };
    if (!key) { r.msg = 'Item sem nome de chave.'; return r; }
    if (!spec) { r.msg = 'Chave fora da lista que o app altera com segurança.'; return r; }
    if (!(key in p.cfg)) { r.msg = 'Esta chave não existe neste projeto.'; return r; }
    const raw = it.valor ?? it.value;
    if (raw === undefined || raw === null) { r.msg = 'Item sem valor.'; return r; }
    try { r.after = coerce(spec, raw, p.cfg[key]); } catch (e) { r.msg = e.message; return r; }
    const wasNum = x => typeof x === 'number';
    if (Array.isArray(r.before) ? wasNum(r.before[0]) : wasNum(r.before)) {
      r.after = Array.isArray(r.after) ? r.after.map(Number) : Number(r.after);
    }
    r.status = sameVal(r.after, r.before) ? 'same' : 'change';
    if (r.status === 'change') r.conflicts = p.objects.filter(o => o.overrides.includes(key)).map(o => o.name);
    return r;
  });
}
/* Chaves que ficam no perfil de filamento (s_Preset_filament_options do Bambu Studio). As demais que o app
   altera ficam no perfil de processo; nenhuma fica no perfil da impressora. */
const FILAMENT_KEYS = new Set([
  'nozzle_temperature', 'nozzle_temperature_initial_layer', 'hot_plate_temp', 'hot_plate_temp_initial_layer',
  'textured_plate_temp', 'textured_plate_temp_initial_layer', 'cool_plate_temp', 'cool_plate_temp_initial_layer',
  'eng_plate_temp', 'eng_plate_temp_initial_layer', 'fan_min_speed', 'fan_max_speed', 'overhang_fan_speed',
  'close_fan_the_first_x_layers', 'slow_down_layer_time', 'filament_max_volumetric_speed'
]);
/* Ao abrir o projeto, o Bambu Studio volta ao valor do perfil do sistema toda chave que não estiver listada em
   different_settings_to_system. A lista tem uma posição para o processo (0), uma por filamento (1..n) e uma
   para a impressora (n+1); cada posição traz as chaves separadas por ";". */
function markDifferent(cfg, keys) {
  const nFil = Array.isArray(cfg.filament_settings_id) && cfg.filament_settings_id.length ? cfg.filament_settings_id.length : 1;
  const list = Array.isArray(cfg.different_settings_to_system) ? cfg.different_settings_to_system.map(v => String(v ?? '')) : [];
  while (list.length < nFil + 2) list.push('');
  const add = (i, k) => {
    const set = new Set(list[i].split(';').map(x => x.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean));
    set.add(k);
    list[i] = [...set].join(';');
  };
  keys.forEach(k => {
    if (FILAMENT_KEYS.has(k)) for (let i = 1; i <= nFil; i++) add(i, k);
    else add(0, k);
  });
  cfg.different_settings_to_system = list;
}
async function buildModified(p, accepted, opts) {
  const o = opts || {};
  const cfg = JSON.parse(JSON.stringify(p.cfg));
  accepted.forEach(c => { cfg[c.key] = c.after; });
  markDifferent(cfg, accepted.map(c => c.key));
  const rep = new Map();
  rep.set(CFG_PATH, JSON.stringify(cfg, null, 4));
  if (o.removeOverrides && p.modelXml) {
    const keys = new Set(accepted.map(c => c.key));
    rep.set(MS_PATH, stripOverrides(p.modelXml, keys));
  }
  const items = [];
  for (const e of p.zip.entries) {
    if (rep.has(e.name)) items.push(await newItem(e.nameBytes, rep.get(e.name), e));
    else items.push({ nameBytes: e.nameBytes, flags: e.flags & 0x0800, method: e.method, time: e.time, date: e.date, crc: e.crc, csize: e.csize, usize: e.usize, data: rawData(p.zip, e) });
  }
  return new Blob(writeZip(items), { type: 'model/3mf' });
}
function changesText(p, f, fileName, accepted) {
  const L = ['Ajustes aplicados em ' + fileName, 'Impressora: ' + f.printer + ' | bico ' + f.nozzle + ' mm | ' + f.ams, 'Filamento: ' + filamentLabel(f), ''];
  accepted.forEach(c => {
    L.push('- ' + c.spec.label + ' (' + c.key + '): ' + fmtVal(c.spec, c.before) + ' -> ' + fmtVal(c.spec, c.after));
    if (c.reason) L.push('  Motivo: ' + c.reason);
  });
  return L.join('\n') + '\n';
}

/* ---------- Projeto de exemplo (demonstração, sem geometria) ---------- */
async function makeExample() {
  const cfg = {
    printer_model: 'Bambu Lab A1', printer_settings_id: 'Bambu Lab A1 0.4 nozzle', nozzle_diameter: ['0.4'],
    filament_type: ['PLA', 'PLA', 'PLA', 'PLA'], filament_settings_id: ['Multifila PLA', 'Multifila PLA', 'Multifila PLA', 'Multifila PLA'],
    filament_colour: ['#FFFFFF', '#1A1A1A', '#D8452E', '#2F6DB5'],
    layer_height: '0.2', initial_layer_print_height: '0.2', wall_loops: '2', top_shell_layers: '5', bottom_shell_layers: '3',
    sparse_infill_density: '15%', sparse_infill_pattern: 'grid', top_one_wall_type: 'all top', enable_support: '0', support_type: 'normal(auto)', support_threshold_angle: '30',
    brim_type: 'auto_brim', brim_width: '5', initial_layer_speed: '50', outer_wall_speed: '200', inner_wall_speed: '300', sparse_infill_speed: '270',
    nozzle_temperature: ['220', '220', '220', '220'], nozzle_temperature_initial_layer: ['220', '220', '220', '220'],
    textured_plate_temp: ['55', '55', '55', '55'], hot_plate_temp: ['55', '55', '55', '55'],
    fan_min_speed: ['100', '100', '100', '100'], overhang_fan_speed: ['100', '100', '100', '100'],
    enable_prime_tower: '1', prime_tower_width: '35',
    // Como num projeto real: processo, 4 filamentos e impressora.
    different_settings_to_system: ['enable_support', '', '', '', '', '']
  };
  const model = '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter"><metadata name="Application">BambuStudio-02.00.00</metadata></model>';
  const ms = '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <object id="2">\n    <metadata key="name" value="Suporte de celular"/>\n    <metadata key="wall_loops" value="3"/>\n  </object>\n  <plate>\n    <metadata key="plater_id" value="1"/>\n  </plate>\n</config>\n';
  const files = [['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'], ['3D/3dmodel.model', model], [CFG_PATH, JSON.stringify(cfg, null, 4)], [MS_PATH, ms]];
  const items = [];
  for (const [n, t] of files) items.push(await newItem(enc.encode(n), t, null));
  return await new Blob(writeZip(items)).arrayBuffer();
}

export { openProject, detect, buildSummary, extractJson, evaluateChanges, buildModified, changesText, makeExample, fmtVal, GROUPS };
