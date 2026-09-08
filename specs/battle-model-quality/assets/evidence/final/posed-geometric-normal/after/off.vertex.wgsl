// Three.js r185 - Node System

// directives


// structs


// uniforms

struct NodeBuffer_185555Struct {
	value : array< vec4<f32> >
};
@binding( 16 ) @group( 1 )
var<storage, read> NodeBuffer_185555 : NodeBuffer_185555Struct;

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
var<private> normalLocal : vec3<f32>;
var<private> nodeVar0 : vec4<f32>;
var<private> nodeVar1 : vec4<f32>;
var<private> nodeVar2 : vec4<f32>;
var<private> nodeVar3 : vec3<f32>;
var<private> nodeVar4 : f32;
var<private> nodeVar5 : f32;
var<private> nodeVar6 : f32;
var<private> nodeVar7 : vec3<f32>;
var<private> nodeVar8 : vec4<f32>;
var<private> nodeVar9 : vec4<f32>;
var<private> nodeVar10 : vec3<f32>;
var<private> nodeVar11 : vec3<f32>;
var<private> nodeVar15 : f32;
var<private> nodeVar16 : vec3<f32>;
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
	@location( 1 ) normal : vec3<f32>,
	@location( 2 ) inst1 : vec4<f32>,
	@location( 3 ) joints : vec4<f32>,
	@location( 4 ) weights : vec4<f32>,
	@location( 5 ) inst0 : vec4<f32>,
	@location( 6 ) inst2 : vec4<f32>,
	@location( 7 ) color : vec4<f32>,
	@location( 8 ) materialId : f32,
	@location( 9 ) uv : vec2<f32>,
	@location( 10 ) factionMask : f32,
	@location( 11 ) tangent : vec4<f32> ) -> VaryingsStruct {

	// flow
	// code

	positionLocal = position;
	normalLocal = normal;
	nodeVar0 = ( ( ( ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.x ) * 4u ) ) + 0u ) ] * vec4<f32>( weights.x ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.y ) * 4u ) ) + 0u ) ] * vec4<f32>( weights.y ) ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.z ) * 4u ) ) + 0u ) ] * vec4<f32>( weights.z ) ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.w ) * 4u ) ) + 0u ) ] * vec4<f32>( weights.w ) ) );
	nodeVar1 = ( ( ( ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.x ) * 4u ) ) + 1u ) ] * vec4<f32>( weights.x ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.y ) * 4u ) ) + 1u ) ] * vec4<f32>( weights.y ) ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.z ) * 4u ) ) + 1u ) ] * vec4<f32>( weights.z ) ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.w ) * 4u ) ) + 1u ) ] * vec4<f32>( weights.w ) ) );
	nodeVar2 = ( ( ( ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.x ) * 4u ) ) + 2u ) ] * vec4<f32>( weights.x ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.y ) * 4u ) ) + 2u ) ] * vec4<f32>( weights.y ) ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.z ) * 4u ) ) + 2u ) ] * vec4<f32>( weights.z ) ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.w ) * 4u ) ) + 2u ) ] * vec4<f32>( weights.w ) ) );
	nodeVar3 = normalize( ( ( ( nodeVar0 * vec4<f32>( normal.x ) ) + ( nodeVar1 * vec4<f32>( normal.y ) ) ) + ( nodeVar2 * vec4<f32>( normal.z ) ) ).xyz );
	nodeVar4 = ( inst0.z - 1.5707964 );
	nodeVar5 = cos( nodeVar4 );
	nodeVar6 = sin( nodeVar4 );
	nodeVar7 = vec3<f32>( ( ( nodeVar3.x * nodeVar5 ) - ( nodeVar3.y * nodeVar6 ) ), ( ( nodeVar3.x * nodeVar6 ) + ( nodeVar3.y * nodeVar5 ) ), nodeVar3.z );
	normalLocal = nodeVar7;
	nodeVar8 = ( ( ( ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.x ) * 4u ) ) + 3u ) ] * vec4<f32>( weights.x ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.y ) * 4u ) ) + 3u ) ] * vec4<f32>( weights.y ) ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.z ) * 4u ) ) + 3u ) ] * vec4<f32>( weights.z ) ) ) + ( NodeBuffer_185555.value[ ( ( ( u32( inst1.y ) * 116u ) + ( u32( joints.w ) * 4u ) ) + 3u ) ] * vec4<f32>( weights.w ) ) );
	nodeVar9 = ( ( ( ( nodeVar0 * vec4<f32>( position.x ) ) + ( nodeVar1 * vec4<f32>( position.y ) ) ) + ( nodeVar2 * vec4<f32>( position.z ) ) ) + nodeVar8 );
	nodeVar10 = ( nodeVar9.xyz * vec3<f32>( inst1.x ) );
	nodeVar11 = vec3<f32>( ( ( inst0.x + ( nodeVar10.x * nodeVar5 ) ) - ( nodeVar10.y * nodeVar6 ) ), ( ( inst0.y + ( nodeVar10.x * nodeVar6 ) ) + ( nodeVar10.y * nodeVar5 ) ), ( nodeVar10.z + inst2.x ) );
	positionLocal = nodeVar11;
	varyings.nodeVarying13 = color;
	varyings.nodeVarying3 = i32( materialId );
	varyings.nodeVarying14 = uv;
	nodeVar15 = inst2.z;
	nodeVar16 = vec3<f32>( inst0.w, nodeVar15, mix( 1.0, mix( 0.45, 1.0, smoothstep( 0.0, 0.42, nodeVar9.z ) ), ( 1.0 - nodeVar15 ) ) );
	varyings.nodeVarying4 = nodeVar16;
	varyings.nodeVarying15 = factionMask;
	varyings.v_normalViewGeometry = normalize( ( render.cameraViewMatrix * vec4<f32>( ( object.nodeUniform6 * normalLocal ), 0.0 ) ).xyz );
	varyings.nodeVarying6 = nodeVar11;
	varyings.nodeVarying7 = nodeVar7;
	nodeVar30 = max( max( abs( ( ( ( nodeVar0 * vec4<f32>( tangent.x ) ) + ( nodeVar1 * vec4<f32>( tangent.y ) ) ) + ( nodeVar2 * vec4<f32>( tangent.z ) ) ).xyz.x ), abs( ( ( ( nodeVar0 * vec4<f32>( tangent.x ) ) + ( nodeVar1 * vec4<f32>( tangent.y ) ) ) + ( nodeVar2 * vec4<f32>( tangent.z ) ) ).xyz.y ) ), abs( ( ( ( nodeVar0 * vec4<f32>( tangent.x ) ) + ( nodeVar1 * vec4<f32>( tangent.y ) ) ) + ( nodeVar2 * vec4<f32>( tangent.z ) ) ).xyz.z ) );
	nodeVar31 = ( ( ( ( nodeVar0 * vec4<f32>( tangent.x ) ) + ( nodeVar1 * vec4<f32>( tangent.y ) ) ) + ( nodeVar2 * vec4<f32>( tangent.z ) ) ).xyz / vec3<f32>( max( nodeVar30, f32( ( nodeVar30 == 0.0 ) ) ) ) );
	nodeVar32 = mix( vec3<f32>( 0.0, 0.0, 0.0 ), ( nodeVar31 / vec3<f32>( sqrt( max( dot( nodeVar31, nodeVar31 ), 1e-12 ) ) ) ), f32( ( nodeVar30 > 0.0 ) ) );
	nodeVar33 = vec3<f32>( ( ( nodeVar32.x * nodeVar5 ) - ( nodeVar32.y * nodeVar6 ) ), ( ( nodeVar32.x * nodeVar6 ) + ( nodeVar32.y * nodeVar5 ) ), nodeVar32.z );
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
