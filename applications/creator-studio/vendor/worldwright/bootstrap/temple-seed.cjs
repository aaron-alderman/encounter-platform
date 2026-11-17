/* Pure Temple seed: bounded surface-process evaluator.
 * Native functionality is supplied only through injected ports.
 * No application, DOM construction, CSS, signup or assurance programme lives here.
 * Control/value semantics derive from Claimipedia's surface-process interpreter.
 */
'use strict';

function createKernel(ports = {}, limit = 2000000) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw Error('Invalid execution budget [TEMPLE-K002]');
  let ticks = 0;
  const exhausted = Object.assign(Error('Execution budget exceeded'), {code:'TEMPLE-K001'});
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  const name = key => {
    if (typeof key !== 'string' || forbidden.has(key)) throw Error('Invalid binding');
    return key;
  };
  const tick = () => { if (++ticks > limit) throw exhausted; };
  function reference(path, env) {
    if (!/^\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_-]+)*$/.test(path)) throw Error('Invalid process reference');
    let result = env;
    for (const key of path.slice(1).split('.')) {
      name(key);
      if (!result || typeof result !== 'object') throw Error('Unknown reference: ' + path);
      const descriptor = Object.getOwnPropertyDescriptor(result, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw Error('Unknown reference: ' + path);
      result = descriptor.value;
    }
    return result;
  }
  function evaluate(x, env) {
    tick();
    if (typeof x === 'string' && x.startsWith('$')) return reference(x, env);
    if (x && typeof x === 'object' && !Array.isArray(x))
      return Object.fromEntries(Object.entries(x).map(([k, v]) => [name(k), evaluate(v, env)]));
    if (!Array.isArray(x)) return x;
    if (!x.length) return [];
    const [op, ...args] = x, v = i => evaluate(args[i], env);
    switch (op) {
      case 'fold': {
        const items=v(0), item=name(args[1]), accumulator=name(args[2]);
        if (!Array.isArray(items) || item===accumulator) throw Error('Invalid expression fold');
        let result=v(3);
        for (const value of items) result=evaluate(args[4],{...env,[item]:value,[accumulator]:result});
        return result;
      }
      case 'let': return evaluate(args[2],{...env,[name(args[0])]:v(1)});
      case 'raise': throw Error(v(0));
      case 'isArray': return Array.isArray(v(0));
      case 'list': return args.map(a => evaluate(a, env));
      case 'append': {
        const a = v(0), b = v(1);
        if (!Array.isArray(a) || !Array.isArray(b)) throw Error('append requires arrays');
        return a.concat(b);
      }
      case 'eq': return JSON.stringify(v(0)) === JSON.stringify(v(1));
      case 'includes': return v(0).includes(v(1));
      case 'if': return evaluate(args[v(0) ? 1 : 2], env);
      case 'count': return v(0).length;
      case 'at': {const value=v(0),key=v(1);return value==null?undefined:Object.getOwnPropertyDescriptor(Object(value),key)?.value;}
      case 'concat': return args.map(a => evaluate(a, env)).join('');
      case 'add': return Number(v(0)) + Number(v(1));
      case 'range': {
        const length = v(0);
        if (!Number.isSafeInteger(length) || length < 0 || length > limit) throw Error('Invalid bounded range');
        return Array.from({length}, (_, i) => i + 1);
      }
      case 'distinct': return [...new Set(v(0))];
      default: throw Error('Unknown algebra operation: ' + String(op));
    }
  }
  async function run(program, env) {
    if (!Array.isArray(program)) throw Error('Process must be an array');
    for (const step of program) {
      tick();
      const kinds = ['let', 'assert', 'when', 'each', 'fold', 'call', 'port', 'try'].filter(k => Object.hasOwn(step, k));
      if (kinds.length !== 1) throw Error('Unknown or ambiguous process statement');
      switch (kinds[0]) {
        case 'let': env[name(step.let)] = evaluate(step.value, env); break;
        case 'assert': if (!evaluate(step.assert, env)) throw Error(step.message); break;
        case 'when': if (evaluate(step.when, env)) await run(step.then, env); break;
        case 'each':
          for (const item of evaluate(step.each, env)) await run(step.steps, {...env, [name(step.as)]: item});
          break;
        case 'fold': {
          let accumulator = evaluate(step.initial, env);
          for (const item of evaluate(step.fold, env)) {
            const local = {...env, [name(step.as)]: item, [name(step.accumulator)]: accumulator};
            await run(step.steps, local);
            accumulator = evaluate(step.yield, local);
          }
          env[name(step.into)] = accumulator;
          break;
        }
        case 'call':
          if (!Object.hasOwn(env.model.queries, step.call)) throw Error('Unknown process: ' + step.call);
          await run(env.model.queries[step.call], env); break;
        case 'port':
          if (!Object.hasOwn(ports, step.port)) throw Error('Unknown host port: ' + step.port);
          env[name(step.into)] = await ports[step.port](evaluate(step.args, env), env); break;
        case 'try':
          try { await run(step.try, env); }
          catch (error) {
            if (error === exhausted) throw error;
            env[name(step.error)] = {name: error.name, message: error.message};
            await run(step.catch, env);
          }
          break;
      }
    }
    return env;
  }
  return {evaluate,run,get usage(){return {steps:ticks,limit};}};
}

createKernel.operators=Object.freeze(['fold','let','raise','isArray','list','append','eq','includes','if','count','at','concat','add','range','distinct']);
module.exports = {createKernel};
