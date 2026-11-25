const credentials='The email or password was not accepted. Check your details or reset your password.';
const unavailable='Sign-in is temporarily unavailable. Please try again shortly.';
const messages:Record<string,string>={
 'auth/invalid-credential':credentials,'auth/invalid-login-credentials':credentials,'auth/user-not-found':credentials,'auth/wrong-password':credentials,'auth/user-disabled':credentials,'invalid_credentials':credentials,
 'auth/email-already-in-use':'Unable to create this account. Try signing in or resetting your password.',
 'auth/too-many-requests':'Too many attempts. Please wait before trying again.','rate_limited':'Too many attempts. Please wait before trying again.',
 'auth/invalid-verification-code':'The verification code is incorrect. Check the code and try again.',
 'auth/code-expired':'The verification code has expired. Request a new code.',
 'auth/session-expired':'The verification code has expired. Request a new code.',
 'auth/missing-verification-code':'Enter the verification code to continue.',
 'auth/network-request-failed':'Could not connect. Check your internet connection and try again.',
 'auth/popup-closed-by-user':'Sign-in was closed before it finished. Try again when you’re ready.',
 'auth/popup-blocked':'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
 'auth/cancelled-popup-request':'A sign-in window is already open. Finish it before trying again.',
 'auth/invalid-email':'Enter a valid email address.','auth/weak-password':'Choose a password with at least 8 characters.',
 'auth/requires-recent-login':'Please sign in again before changing your account.',
 'auth/account-exists-with-different-credential':'Try the sign-in method you previously used for this account.',
 'auth_unavailable':unavailable,'auth/invalid-phone-number':'Enter a valid phone number, including the country code.',
};
export const SESSION_EXPIRED='Your session has expired. Please sign in again.';
/** Never display provider responses, SQL errors, tokens or user-existence hints. */
export function authErrorMessage(error:unknown){
 const value=error as {code?:string;status?:number;requestId?:string;message?:string;name?:string};
 const code=String(value?.code||'').toLowerCase();
 let message=messages[code];
 if(!message){
  if(value?.status===429)message=messages.rate_limited;
  else if(value?.status===401)message=SESSION_EXPIRED;
  else if(value?.status===403)message='This account does not have permission to continue.';
  else if(value?.status===503||value?.status===502||value?.status===504||code.startsWith('auth/'))message=unavailable;
  else if(error instanceof TypeError||['AbortError','TimeoutError'].includes(value?.name||''))message=messages['auth/network-request-failed'];
  else message='Could not complete sign-in. Please try again.';
 }
 // A previously normalized error may pass through more than one UI boundary.
 const plain=String(value?.message||'').replace(/ \(Reference: [A-Za-z0-9-]{1,100}\)$/,'');
 if(Object.values(messages).includes(plain)||plain===SESSION_EXPIRED)message=plain;
 const reference=value?.requestId||String(value?.message||'').match(/\(Reference: ([A-Za-z0-9-]{1,100})\)$/)?.[1];
 return reference&&/^[A-Za-z0-9-]{1,100}$/.test(reference)?`${message} (Reference: ${reference})`:message;
}
