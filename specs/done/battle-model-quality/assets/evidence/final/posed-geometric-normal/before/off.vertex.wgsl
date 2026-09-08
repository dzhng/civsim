// Three.js r185 - Node System

// directives


// structs


// uniforms

struct NodeBuffer_161675Struct {
	value : array< vec4<f32> >
};
@binding( 16 ) @group( 1 )
var<storage, read> NodeBuffer_161675 : NodeBuffer_161675Struct;

struct renderStruct {
	cameraProjectionMatrix : mat4x4<f32>,
	cameraViewMatrix : mat4x4<f32>,
	nodeUniform14 : vec3<f32>,
	nodeUniform12 : vec3<f32>,
	nodeUniform13 : vec3<f32>,
	cameraWorldMatrix : mat4x4<f32>,
	cameraPosition : vec3<f32>,
	nodeUniform15 : mat4x4<f32>,
	nodeUniform16 : f32,
	nodeUniform17 : f32,
	nodeUniform21 : f32,
	nodeUniform19 : f32,
	nodeUniform20 : vec2<f32>
};
@binding( 0 ) @group( 0 )
var<uniform> render : renderStruct;

struct objectStruct {
	nodeUniform3 : f32,
	nodeUniform6 : mat3x3<f32>,
	nodeUniform7 : vec3<f32>,
	nodeUniform8 : f32,
	nodeUniform10 : mat3x3<f32>,
	nodeUniform22 : mat4x4<f32>,
	nodeUniform24 : f32,
	nodeUniform25 : mat4x4<f32>,
	nodeUniform27 : f32,
	nodeUniform28 : f32,
	nodeUniform30 : f32,
	nodeUniform31 : vec2<f32>
};
@binding( 3 ) @group( 1 )
var<uniform> object : objectStruct;

// varyings

struct VaryingsStruct {
	@location( 0 ) @interpolate( flat ) nodeVarying3 : i32,
	@location( 1 ) nodeVarying4 : vec3<f32>,
	@location( 2 ) v_normalViewGeometry : vec3<f32>,
	@location( 3 ) nodeVarying6 : vec3<f32>,
	@location( 4 ) nodeVarying7 : vec3<f32>,
	@location( 5 ) nodeVarying8 : vec3<f32>,
	@location( 6 ) @interpolate( flat ) nodeVarying9 : f32,
	@location( 7 ) v_positionViewDirection : vec3<f32>,
	@location( 8 ) v_positionWorld : vec3<f32>,
	@location( 9 ) nodeVarying13 : vec4<f32>,
	@location( 10 ) nodeVarying14 : vec2<f32>,
	@location( 11 ) nodeVarying15 : f32,
	@builtin( position ) builtinClipSpace : vec4<f32>
};
var<private> varyings : VaryingsStruct;

// vars
var<private> nodeVar0 : vec4<f32>;
var<private> nodeVar1 : vec4<f32>;
var<private> nodeVar2 : vec4<f32>;
var<private> nodeVar3 : vec4<f32>;
var<private> nodeVar4 : vec4<f32>;
var<private> nodeVar5 : vec3<f32>;
var<private> nodeVar6 : f32;
var<private> nodeVar7 : f32;
var<private> nodeVar8 : f32;
var<private> nodeVar9 : vec3<f32>;
var<private> nodeVar13 : f32;
var<private> nodeVar14 : vec3<f32>;
var<private> normalLocal : vec3<f32>;
var<private> nodeVar24 : vec3<f32>;
var<private> nodeVar25 : vec3<f32>;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : vec3<f32>;
var<private> nodeVar32 : vec3<f32>;
var<private> nodeVar33 : vec3<f32>;
var<private> modelViewMatrix : mat4x4<f32>;
var<private> VERTEX_nodeVar215 : vec4<f32>;
var<private> positionLocal : vec3<f32>;
var<private> v_modelViewProjection : vec4<f32>;
var<private> v_positionView : vec3<f32>;
var<private> VERTEX_v_modelViewProjection : vec4<f32>;

// codes


@vertex
fn main( @location( 0 ) position : vec3<f32>,
	@location( 1 ) inst0 : vec4<f32>,
	@location( 2 ) inst1 : vec4<f32>,
	@location( 3 ) joints : vec4<f32>,
	@location( 4 ) weights : vec4<f32>,
	@location( 5 ) inst2 : vec4<f32>,
	@location( 6 ) color : vec4<f32>,
	@location( 7 ) materialId : f32,
	@location( 8 ) uv : vec2<f32>,
	@location( 9 ) factionMask : f32,
	@location( 10 ) normal : vec3<f32>,
	@location( 11 ) tangent : vec4<f32> ) -> VaryingsStruct {

	// flow
	// code

	positionLocal = position;
	nodeVar0 = ( ( ( ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.x ) * 4u ) ) + 0u ) ] * vec4<f32>( weights.x ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.y ) * 4u ) ) + 0u ) ] * vec4<f32>( weights.y ) ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.z ) * 4u ) ) + 0u ) ] * vec4<f32>( weights.z ) ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.w ) * 4u ) ) + 0u ) ] * vec4<f32>( weights.w ) ) );
	nodeVar1 = ( ( ( ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.x ) * 4u ) ) + 1u ) ] * vec4<f32>( weights.x ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.y ) * 4u ) ) + 1u ) ] * vec4<f32>( weights.y ) ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.z ) * 4u ) ) + 1u ) ] * vec4<f32>( weights.z ) ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.w ) * 4u ) ) + 1u ) ] * vec4<f32>( weights.w ) ) );
	nodeVar2 = ( ( ( ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.x ) * 4u ) ) + 2u ) ] * vec4<f32>( weights.x ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.y ) * 4u ) ) + 2u ) ] * vec4<f32>( weights.y ) ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.z ) * 4u ) ) + 2u ) ] * vec4<f32>( weights.z ) ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.w ) * 4u ) ) + 2u ) ] * vec4<f32>( weights.w ) ) );
	nodeVar3 = ( ( ( ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.x ) * 4u ) ) + 3u ) ] * vec4<f32>( weights.x ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.y ) * 4u ) ) + 3u ) ] * vec4<f32>( weights.y ) ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.z ) * 4u ) ) + 3u ) ] * vec4<f32>( weights.z ) ) ) + ( NodeBuffer_161675.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.w ) * 4u ) ) + 3u ) ] * vec4<f32>( weights.w ) ) );
	nodeVar4 = ( ( ( ( nodeVar0 * vec4<f32>( position.x ) ) + ( nodeVar1 * vec4<f32>( position.y ) ) ) + ( nodeVar2 * vec4<f32>( position.z ) ) ) + nodeVar3 );
	nodeVar5 = ( nodeVar4.xyz * vec3<f32>( inst1.x ) );
	nodeVar6 = ( inst0.z - 1.5707964 );
	nodeVar7 = cos( nodeVar6 );
	nodeVar8 = sin( nodeVar6 );
	nodeVar9 = vec3<f32>( ( ( inst0.x + ( nodeVar5.x * nodeVar7 ) ) - ( nodeVar5.y * nodeVar8 ) ), ( ( inst0.y + ( nodeVar5.x * nodeVar8 ) ) + ( nodeVar5.y * nodeVar7 ) ), ( nodeVar5.z + inst2.x ) );
	positionLocal = nodeVar9;
	varyings.nodeVarying13 = color;
	varyings.nodeVarying3 = i32( materialId );
	varyings.nodeVarying14 = uv;
	nodeVar13 = inst2.z;
	nodeVar14 = vec3<f32>( inst0.w, nodeVar13, mix( 1.0, mix( 0.45, 1.0, smoothstep( 0.0, 0.42, nodeVar4.z ) ), ( 1.0 - nodeVar13 ) ) );
	varyings.nodeVarying4 = nodeVar14;
	varyings.nodeVarying15 = factionMask;
	normalLocal = normal;
	varyings.v_normalViewGeometry = normalize( ( render.cameraViewMatrix * vec4<f32>( ( object.nodeUniform6 * normalLocal ), 0.0 ) ).xyz );
	varyings.nodeVarying6 = nodeVar9;
	nodeVar24 = normalize( ( ( ( nodeVar0 * vec4<f32>( normal.x ) ) + ( nodeVar1 * vec4<f32>( normal.y ) ) ) + ( nodeVar2 * vec4<f32>( normal.z ) ) ).xyz );
	nodeVar25 = vec3<f32>( ( ( nodeVar24.x * nodeVar7 ) - ( nodeVar24.y * nodeVar8 ) ), ( ( nodeVar24.x * nodeVar8 ) + ( nodeVar24.y * nodeVar7 ) ), nodeVar24.z );
	varyings.nodeVarying7 = nodeVar25;
	nodeVar30 = max( max( abs( ( ( ( nodeVar0 * vec4<f32>( tangent.x ) ) + ( nodeVar1 * vec4<f32>( tangent.y ) ) ) + ( nodeVar2 * vec4<f32>( tangent.z ) ) ).xyz.x ), abs( ( ( ( nodeVar0 * vec4<f32>( tangent.x ) ) + ( nodeVar1 * vec4<f32>( tangent.y ) ) ) + ( nodeVar2 * vec4<f32>( tangent.z ) ) ).xyz.y ) ), abs( ( ( ( nodeVar0 * vec4<f32>( tangent.x ) ) + ( nodeVar1 * vec4<f32>( tangent.y ) ) ) + ( nodeVar2 * vec4<f32>( tangent.z ) ) ).xyz.z ) );
	nodeVar31 = ( ( ( ( nodeVar0 * vec4<f32>( tangent.x ) ) + ( nodeVar1 * vec4<f32>( tangent.y ) ) ) + ( nodeVar2 * vec4<f32>( tangent.z ) ) ).xyz / vec3<f32>( max( nodeVar30, f32( ( nodeVar30 == 0.0 ) ) ) ) );
	nodeVar32 = mix( vec3<f32>( 0.0, 0.0, 0.0 ), ( nodeVar31 / vec3<f32>( sqrt( max( dot( nodeVar31, nodeVar31 ), 1e-12 ) ) ) ), f32( ( nodeVar30 > 0.0 ) ) );
	nodeVar33 = vec3<f32>( ( ( nodeVar32.x * nodeVar7 ) - ( nodeVar32.y * nodeVar8 ) ), ( ( nodeVar32.x * nodeVar8 ) + ( nodeVar32.y * nodeVar7 ) ), nodeVar32.z );
	varyings.nodeVarying8 = nodeVar33;
	varyings.nodeVarying9 = tangent.w;
	modelViewMatrix = ( render.cameraViewMatrix * object.nodeUniform22 );
	v_positionView = ( modelViewMatrix * vec4<f32>( positionLocal, 1.0 ) ).xyz;
	varyings.v_positionViewDirection = ( - v_positionView );
	varyings.v_positionWorld = ( object.nodeUniform22 * vec4<f32>( positionLocal, 1.0 ) ).xyz;
	VERTEX_nodeVar215 = ( render.cameraProjectionMatrix * vec4<f32>( v_positionView, 1.0 ) );
	VERTEX_v_modelViewProjection = VERTEX_nodeVar215;

	// result

	varyings.builtinClipSpace = VERTEX_v_modelViewProjection;

	return varyings;

}
