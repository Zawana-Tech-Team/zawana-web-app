import test from 'node:test';
import assert from 'node:assert/strict';
import { firebaseUserLookup, verifiedFirebaseIdentity } from '../src/modules/auth/firebaseIdentityPolicy.js';

test('verified Firebase email and phone claims permit UID lookup', () => {
  assert.equal(verifiedFirebaseIdentity({ uid: 'google-uid', email: 'member@example.test', email_verified: true }).verified, true);
  assert.equal(verifiedFirebaseIdentity({ uid: 'apple-uid', email: 'relay@privaterelay.appleid.com', email_verified: true }).verified, true);
  assert.equal(verifiedFirebaseIdentity({ uid: 'phone-uid', phone_number: '+959421234567', firebase: { sign_in_provider: 'phone' } }).verified, true);
});
test('unverified contact details, malformed phone and missing UID do not authorize a session', () => {
  assert.equal(verifiedFirebaseIdentity({ uid: 'a', email: 'member@example.test', email_verified: false }).verified, false);
  assert.equal(verifiedFirebaseIdentity({ uid: 'a', phone_number: '+959421234567' }).verified, false);
  assert.equal(verifiedFirebaseIdentity({ uid: 'a', phone_number: '09421234567', firebase: { sign_in_provider: 'phone' } }).verified, false);
  assert.equal(verifiedFirebaseIdentity({ uid: '', email: 'member@example.test', email_verified: true }).verified, false);
});
test('explicitly linked Firebase phone identity is accepted; unrelated phone claims are rejected', () => {
  assert.equal(verifiedFirebaseIdentity({ uid: 'a', phone_number: '+959421234567', firebase: { identities: { phone: ['+959421234567'] } } }).verified, true);
  assert.equal(verifiedFirebaseIdentity({ uid: 'a', phone_number: '+959421234567', firebase: { identities: { phone: ['+6581234567'] } } }).verified, false);
});
test('application account lookup uses only Firebase UID, never matching contact information', () => {
  assert.deepEqual(firebaseUserLookup('firebase-uid'), { firebaseUid: 'firebase-uid' });
});
