import test from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, SESSION_EXPIRED } from '../../src/services/authErrors.js';

test('sign-in messages are safe, actionable and do not enumerate accounts',()=>{
 const codes=['auth/user-not-found','auth/wrong-password','auth/invalid-credential','auth/user-disabled','INVALID_CREDENTIALS'];
 assert.equal(new Set(codes.map(code=>authErrorMessage({code}))).size,1);
 assert.match(authErrorMessage({code:'auth/code-expired'}),/expired.*new code/);
 assert.match(authErrorMessage({code:'auth/invalid-verification-code'}),/incorrect/);
 assert.match(authErrorMessage({status:429}),/wait/);
 assert.match(authErrorMessage(new TypeError('Failed to fetch')),/internet/);
 assert.match(authErrorMessage({status:503}),/temporarily unavailable/);
 assert.match(authErrorMessage({status:403}),/permission/);
 assert.equal(authErrorMessage({status:401}),SESSION_EXPIRED);
 for(const message of ['Prisma error: password=secret','Firebase: Error (auth/internal-error) <script>','Bearer secret-token'])assert.doesNotMatch(authErrorMessage({message}),/Prisma|Firebase|secret|script|Bearer/);
 const safe=authErrorMessage({code:'AUTH_UNAVAILABLE',requestId:'request-123',message:'sensitive response'});assert.match(safe,/Reference: request-123/);assert.equal(authErrorMessage(new Error(safe)),safe);
 assert.doesNotMatch(authErrorMessage({requestId:'<script>'}),/script/);
});
