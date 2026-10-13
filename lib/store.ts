import {env} from 'cloudflare:workers';
import {defaults,contentSchema} from './content';
export async function readStore(){const row=await env.DB.prepare('SELECT data,revision,updated_at FROM store_content WHERE key = ?').bind('main').first<{data:string,revision:number,updated_at:string}>();return row?{content:contentSchema.parse(JSON.parse(row.data)),revision:row.revision,updatedAt:row.updated_at}:{content:defaults,revision:0,updatedAt:null};}
