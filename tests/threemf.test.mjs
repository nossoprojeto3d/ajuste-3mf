import test from "node:test"
import assert from "node:assert/strict"
import { openProject, buildSummary, extractJson, evaluateChanges, buildModified, makeExample } from "../src/lib/threemf.js"

const form = { printer: "Bambu Lab A1", nozzle: "0.4", ams: "AMS lite (4 cores)", filType: "PLA", brand: "Multifila", use: "Decorativa", prio: "Equilibrada", notes: "" }
const RESP = '```json\n{"alteracoes":[' +
  '{"chave":"layer_height","valor":"0.16","motivo":"detalhe"},' +
  '{"chave":"wall_loops","valor":4},' +
  '{"chave":"sparse_infill_density","valor":"20"},' +
  '{"chave":"nozzle_temperature","valor":215},' +
  '{"chave":"layer_height","valor":"0.5"},' +
  '{"chave":"machine_max_speed_x","valor":"900"},' +
  '{"chave":"sparse_infill_pattern","valor":"Gyroid"},' +
  '{"chave":"brim_type","valor":"auto_brim"},' +
  '{"chave":"fan_min_speed","valor":[50,50]}' + ']}\n```'

test("lê o projeto de exemplo", async () => {
  const p = await openProject(await makeExample())
  assert.equal(p.objects[0].name, "Suporte de celular")
  assert.deepEqual(p.objects[0].overrides, ["wall_loops"])
  assert.equal(p.plates, 1)
  assert.match(buildSummary(p, form, "x.3mf"), /layer_height = 0.2/)
})

test("valida as alterações", async () => {
  const p = await openProject(await makeExample())
  const it = evaluateChanges(p, extractJson(RESP))
  assert.equal(it[0].status, "change")
  assert.deepEqual(it[1].conflicts, ["Suporte de celular"])
  assert.equal(it[2].after, "20%")
  assert.deepEqual(it[3].after, ["215", "215", "215", "215"])
  assert.equal(it[4].status, "bad")
  assert.equal(it[5].status, "bad")
  assert.equal(it[6].after, "gyroid")
  assert.equal(it[7].status, "same")
  assert.equal(it[8].status, "bad")
})

test("grava um 3MF que reabre com os valores novos", async () => {
  const p = await openProject(await makeExample())
  const acc = evaluateChanges(p, extractJson(RESP)).filter((i) => i.status === "change")
  for (const removeOverrides of [false, true]) {
    const out = new Uint8Array(await (await buildModified(p, acc, { removeOverrides })).arrayBuffer())
    const p2 = await openProject(out)
    assert.equal(p2.cfg.layer_height, "0.16")
    assert.equal(p2.cfg.sparse_infill_density, "20%")
    assert.equal(p2.cfg.printer_model, "Bambu Lab A1")
    assert.equal(p2.objects[0].overrides.length, removeOverrides ? 0 : 1)
  }
})

test("marca as chaves alteradas para o Bambu Studio não voltar ao perfil do sistema", async () => {
  // Ao abrir o projeto, o Bambu Studio volta ao valor do perfil toda chave fora de different_settings_to_system.
  const p = await openProject(await makeExample())
  const acc = evaluateChanges(p, extractJson(RESP)).filter((i) => i.status === "change")
  const out = new Uint8Array(await (await buildModified(p, acc)).arrayBuffer())
  const d = (await openProject(out)).cfg.different_settings_to_system
  assert.equal(d.length, 6)
  const keys = (s) => s.split(";").filter(Boolean)
  assert.deepEqual(keys(d[0]), ["enable_support", "layer_height", "wall_loops", "sparse_infill_density", "sparse_infill_pattern"])
  for (const i of [1, 2, 3, 4]) assert.deepEqual(keys(d[i]), ["nozzle_temperature"])
  assert.equal(d[5], "")
})

test("cria a lista de diferenças quando o projeto não tem", async () => {
  const p = await openProject(await makeExample())
  delete p.cfg.different_settings_to_system
  const acc = evaluateChanges(p, extractJson(RESP)).filter((i) => i.status === "change")
  const out = new Uint8Array(await (await buildModified(p, acc)).arrayBuffer())
  const d = (await openProject(out)).cfg.different_settings_to_system
  assert.equal(d.length, 6)
  assert.ok(d[0].split(";").includes("layer_height"))
  assert.ok(d[2].split(";").includes("nozzle_temperature"))
})

test("altera a parede única do topo e marca para o Bambu Studio", async () => {
  const p = await openProject(await makeExample())
  const it = evaluateChanges(p, { alteracoes: [
    { chave: "top_one_wall_type", valor: "not apply" },
    { chave: "top_one_wall_type", valor: "duas paredes" },
  ] })
  assert.equal(it[0].status, "change")
  assert.equal(it[0].after, "not apply")
  assert.equal(it[1].status, "bad")
  assert.match(buildSummary(p, form, "x.3mf"), /top_one_wall_type = all top/)
  const out = await openProject(new Uint8Array(await (await buildModified(p, [it[0]])).arrayBuffer()))
  assert.equal(out.cfg.top_one_wall_type, "not apply")
  assert.ok(out.cfg.different_settings_to_system[0].split(";").includes("top_one_wall_type"))
})
