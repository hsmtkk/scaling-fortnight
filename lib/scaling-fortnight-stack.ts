import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elasticloadbalancingv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const AP_NORTHEAST_ONE = "ap-northeast-1"
const LAMBDA_MEMORY = 512
const LAMBDA_TIMEOUT = 64
const MY_IP = "153.242.194.129/32"

export class ScalingFortnightStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const secret = new secretsmanager.Secret(this, "secret", {
      secretObjectValue: {
        OPENAI_API_KEY: cdk.SecretValue.unsafePlainText("placeholder"),
      },
    })

    const sourceBucket = new s3.Bucket(this, "sourceBucket", {
      autoDeleteObjects: true,
      lifecycleRules: [{
        expiration: cdk.Duration.days(1),
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const embeddingBucket = new s3.Bucket(this, "embeddingBucket", {
      autoDeleteObjects: true,
      lifecycleRules: [{
        expiration: cdk.Duration.days(1),
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const chatLambda = new lambda.DockerImageFunction(this, "chatLambda", {
      code: lambda.DockerImageCode.fromImageAsset("./chat_lambda"),
      environment: {
        "EMBEDDING_BUCKET": embeddingBucket.bucketName,
        "OPENAI_API_KEY": secret.secretValueFromJson("OPENAI_API_KEY").unsafeUnwrap(),
      },
      memorySize: LAMBDA_MEMORY,
      reservedConcurrentExecutions: 1,
      timeout: cdk.Duration.seconds(LAMBDA_TIMEOUT),
    })

    chatLambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"))

    const embeddingLambda = new lambda.DockerImageFunction(this, "embeddingLambda", {
      code: lambda.DockerImageCode.fromImageAsset("./embedding_lambda"),
      environment: {
        "CHAT_LAMBDA": chatLambda.functionName,
        "EMBEDDING_BUCKET": embeddingBucket.bucketName,
        "OPENAI_API_KEY": secret.secretValueFromJson("OPENAI_API_KEY").unsafeUnwrap(),
      },
      memorySize: LAMBDA_MEMORY,
      reservedConcurrentExecutions: 1,
      timeout: cdk.Duration.seconds(LAMBDA_TIMEOUT),
    })

    embeddingLambda.addEventSource(new eventsources.S3EventSource(sourceBucket, {
      events: [s3.EventType.OBJECT_CREATED],
    }))

    embeddingLambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"))
    embeddingLambda.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSLambda_FullAccess"))

    const vpc = new ec2.Vpc(this, "vpc", {
      availabilityZones: [AP_NORTHEAST_ONE + "a", AP_NORTHEAST_ONE + "c", AP_NORTHEAST_ONE + "d"],
      natGateways: 0,
    })

    const securityGroup = new ec2.SecurityGroup(this, "securityGroup", {
      vpc: vpc,
    })

    securityGroup.addIngressRule(ec2.Peer.ipv4(MY_IP), ec2.Port.tcp(80))

    const alb = new elasticloadbalancingv2.ApplicationLoadBalancer(this, "alb", {
      internetFacing: true,
      securityGroup: securityGroup,
      vpc: vpc,
    })

    const cluster = new ecs.Cluster(this, "cluster", {
      vpc: vpc,
    })

    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "service", {
      assignPublicIp: true,
      capacityProviderStrategies: [{
        capacityProvider: "FARGATE_SPOT",
        weight: 1,
        base: 1,
      }],
      cluster: cluster,
      desiredCount: 1,
      loadBalancer: alb,
      openListener: false,
      taskImageOptions: {
        environment: {
          "SOURCE_BUCKET": sourceBucket.bucketName,
          "CHAT_LAMBDA": chatLambda.functionName,
        },
        image: ecs.ContainerImage.fromAsset("./chat_ecs"),
      },
      taskSubnets: cluster.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC,
      }),
    })

    service.taskDefinition.taskRole?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"))
    service.taskDefinition.taskRole?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSLambda_FullAccess"))
  }
}
