import { POLICY_VERSION } from './constants.js';

export const AUTHORITY_BASES = [
  'owner',
  'permission',
  'official_download',
  'public_domain',
  'compatible_license',
  'organizational_authority',
];

export function createAttestation(input, source) {
  if (source?.protection?.isProtected)
    throw new Error('Protected media cannot enter a download job.');
  if (!source?.eligibility?.canDownloadDirectly)
    throw new Error('This source is not eligible for direct download.');
  if (!input?.confirmed || !AUTHORITY_BASES.includes(input.basis))
    throw new Error('Select an authority basis and confirm the declaration.');
  return {
    confirmed: true,
    basis: input.basis,
    caseReference: String(input.caseReference || '').slice(0, 120),
    organizationName: String(input.organizationName || '').slice(0, 120),
    authorizationNote: String(input.authorizationNote || '').slice(0, 500),
    attestedAt: Date.now(),
    policyVersion: POLICY_VERSION,
  };
}
