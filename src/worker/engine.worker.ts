import * as Comlink from 'comlink';
import { createEngineApi } from './api';

Comlink.expose(createEngineApi());
