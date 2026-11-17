'use strict';

// Stage the locked browser renderer and generate its admitted file descriptors.
const { createHash } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, relative } = require('node:path');
const { programSource } = require('../worldwright-unified/bootstrap/program-source.cjs');
const { projector } = require('../worldwright-unified/bootstrap/projection.cjs');
const { pathToFileURL } = require('node:url');
const { encode } = require('../encounter-runtime/test/rel-values.mjs');

const output = process.argv[2];
if (!output) throw Error('Pass the attachment staging directory.');
const three = join(__dirname, '../../game-migration/source/node_modules/three');
const projectionRoot = join(__dirname, '../worldwright-unified');
const programmeGrammar = JSON.parse(readFileSync(join(projectionRoot, 'algebra/program-grammar.json'), 'utf8'));
const vendor = [
  'build/three.module.js', 'build/three.core.js',
  'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/loaders/KTX2Loader.js',
  'examples/jsm/controls/OrbitControls.js', 'examples/jsm/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js', 'examples/jsm/utils/WorkerPool.js',
  'examples/jsm/libs/ktx-parse.module.js', 'examples/jsm/libs/zstddec.module.js',
  'examples/jsm/math/ColorSpaces.js',
  'examples/jsm/libs/basis/basis_transcoder.wasm'
];
const files = {};
function stage(name, bytes) {
  const path = 'asset-viewer/' + name;
  const destination = join(output, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  files[name] = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function usePinnedWorker(source) {
  const start = source.indexOf('\t\t\tconst jsLoader =');
  const end = source.indexOf('\t\t\tif ( _activeLoaders > 0 )', start);
  if (start < 0 || end < 0) throw Error('KTX2Loader worker initialization changed.');
  const worker = `			const binaryLoader = new FileLoader( this.manager );
			binaryLoader.setWithCredentials( this.withCredentials );
			binaryLoader.setResponseType( 'arraybuffer' );
			this.transcoderPending = binaryLoader.loadAsync( WASM_BIN_URL ).then( binaryContent => {
				this.transcoderBinary = binaryContent;
				this.workerPool.setWorkerCreator( () => {
					const worker = new Worker( new URL( '../../../../ktx-worker.js', import.meta.url ) );
					const transcoderBinary = this.transcoderBinary.slice( 0 );
					worker.postMessage( { type: 'init', config: this.workerConfig, transcoderBinary }, [ transcoderBinary ] );
					return worker;
				} );
			} );

`;
  return (source.slice(0, start) + worker + source.slice(end))
    .replace(/^const WASM_JS_URL = .*\n/m, '')
    .replace(/^\s*this\.workerSourceURL = '';\n/m, '\n')
    .replace(/^\s*if \( this\.workerSourceURL \) URL\.revokeObjectURL\( this\.workerSourceURL \);\n/m, '\n');
}

async function main() {
  // Generate the same worker body as Three.js, with its own response policy.
  const loaderFile = join(three, 'examples/jsm/loaders/KTX2Loader.js');
  const { KTX2Loader } = await import(pathToFileURL(loaderFile));
  const worker = KTX2Loader.BasisWorker.toString();
  const constants = ['EngineFormat', 'EngineType', 'TranscoderFormat', 'BasisFormat']
    .map(name => 'const _' + name + ' = ' + JSON.stringify(KTX2Loader[name]) + ';');
  const basis = readFileSync(join(three, 'examples/jsm/libs/basis/basis_transcoder.js'), 'utf8');
  stage('ktx-worker.js', Buffer.from([...constants, basis, worker.slice(worker.indexOf('{') + 1, worker.lastIndexOf('}'))].join('\n')));
  stage('vendor/LICENSE.txt', readFileSync(join(three, 'LICENSE')));
  const compiler = projector(projectionRoot);
  for (const module of ['viewer', 'viewport', 'world-scene', 'terrain']) {
    const source = 'asset-viewer/' + module + '.program.encounter';
    const { document } = programSource(source, name => readFileSync(join(__dirname, name)), programmeGrammar);
    const { text } = await compiler.project(document, programmeGrammar);
    stage(module + '.js', Buffer.from(text));
  }
  for (const name of vendor) {
    const bytes = readFileSync(join(three, name));
    if (!name.endsWith('.js')) {
      stage('vendor/' + name, bytes);
      continue;
    }
    const entry = relative(dirname(name), 'build/three.module.js');
    const specifier = entry.startsWith('.') ? entry : './' + entry;
    let source = bytes.toString('utf8').replace(/from (['"])three\1/g, "from '" + specifier + "'");
    if (name.endsWith('/KTX2Loader.js')) source = usePinnedWorker(source);
    stage('vendor/' + name, Buffer.from(source));
  }
  writeFileSync(process.argv[3] || join(__dirname, 'asset-viewer.rel'), encode(files, 'ApplicationData'));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
