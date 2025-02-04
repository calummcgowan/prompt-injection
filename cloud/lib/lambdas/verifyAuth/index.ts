import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import type {
	CognitoJwtVerifierProperties,
	CognitoVerifyProperties,
	CognitoJwtVerifierSingleUserPool,
} from 'aws-jwt-verify/cognito-verifier';
import type { CognitoAccessTokenPayload } from 'aws-jwt-verify/jwt-model';
import type { CloudFrontRequestEvent, CloudFrontResponse } from 'aws-lambda';

// Leave these alone! They are replaced verbatim by esbuild, see ui-stack
const domainName = process.env.DOMAIN_NAME;
const paramUserPoolId = process.env.PARAM_USERPOOL_ID;
const paramClientId = process.env.PARAM_USERPOOL_CLIENT;
const region = process.env.AWS_REGION;

const inFlightResponse = {
	status: '200',
	statusDescription: 'OK',
	// Headers must be declared lowercase and use this funky format :(
	headers: {
		'access-control-allow-origin': [
			{
				value: `https://${domainName}`,
			},
		],
		'access-control-allow-methods': [
			{
				value: 'HEAD,GET,POST',
			},
		],
		'access-control-allow-headers': [
			{
				value: 'cache-control,content-type,x-amz-target,x-amz-user-agent',
			},
		],
	},
} as CloudFrontResponse;

const unauthorizedResponse = {
	status: '401',
	statusDescription: 'Unauthorized',
} as CloudFrontResponse;

const serverErrorResponse = {
	status: '500',
	statusDescription: 'InternalServerError',
} as CloudFrontResponse;

const retrieveParameters = async () => {
	if (!paramUserPoolId || !paramClientId) {
		throw new Error('Userpool param names not found in ENV!');
	}

	const { Parameters: params } = await new SSMClient({ region }).send(
		new GetParametersCommand({
			Names: [paramUserPoolId, paramClientId],
		})
	);

	if (!params?.length || params.length < 2) throw new Error('Userpool parameters not found in SSM');

	return params;
};

const jwtVerifierPromise = retrieveParameters().then(async (params) => {
	const userPoolId = params.find((param) => param.Name === paramUserPoolId)?.Value;
	const clientId = params.find((param) => param.Name === paramClientId)?.Value;
	if (!userPoolId || !clientId) {
		throw new Error('Userpool id/client not found in ParameterStore');
	}

	const verifier = CognitoJwtVerifier.create<CognitoJwtVerifierProperties>({
		userPoolId,
		clientId,
		tokenUse: 'access',
	});
	await verifier.hydrate();
	return verifier;
});

export const handler = async (event: CloudFrontRequestEvent) => {
	const { request } = event.Records[0].cf;

	// Handle CORS preflight
	if (request.method === 'OPTIONS') {
		return inFlightResponse;
	}

	// eslint-disable-next-line @typescript-eslint/init-declarations
	let verifier: CognitoJwtVerifierSingleUserPool<CognitoJwtVerifierProperties>;
	try {
		verifier = await jwtVerifierPromise;
	} catch (err: unknown) {
		console.error(err);
		return serverErrorResponse;
	}

	try {
		const accessToken = request.headers.authorization[0]?.value;
		if (!accessToken) return unauthorizedResponse;

		const jwt = (await verifier.verify(accessToken, {
			tokenUse: 'access',
		} as CognitoVerifyProperties)) as CognitoAccessTokenPayload;
		// Maybe insert custom header for username? We could then log that at ALB,
		// and generate metrics for user access.
		console.log(`Access verified for [${jwt.username}]`);

		return request;
	} catch (err: unknown) {
		console.log('Unable to verify access token', err);
		return unauthorizedResponse;
	}
};
