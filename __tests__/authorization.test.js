import { createAttestation } from '../utils/authorization.js';

const eligible = {
  src: 'https://m.test/a.mp4',
  eligibility: { canDownloadDirectly: true },
  protection: { isProtected: false },
};

test('requires a basis and confirmation and never accepts protected media', () => {
  expect(() => createAttestation({ basis: 'owner', confirmed: false }, eligible)).toThrow();
  expect(() => createAttestation({ basis: 'invalid', confirmed: true }, eligible)).toThrow();
  const attestation = createAttestation(
    {
      basis: 'owner',
      confirmed: true,
      caseReference: 'case-7',
      organizationName: 'Studio',
      authorizationNote: 'Approved for archive copy',
    },
    eligible,
  );
  expect(attestation.policyVersion).toBe('1.0');
  expect(attestation.caseReference).toBe('case-7');
  expect(attestation.organizationName).toBe('Studio');
  expect(attestation.authorizationNote).toBe('Approved for archive copy');
  expect(() =>
    createAttestation(
      { basis: 'owner', confirmed: true },
      { ...eligible, protection: { isProtected: true } },
    ),
  ).toThrow();
});
