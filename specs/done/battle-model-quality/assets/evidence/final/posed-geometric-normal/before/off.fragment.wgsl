// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms
@binding( 0 ) @group( 1 ) var nodeUniform1 : texture_2d<f32>;
@binding( 1 ) @group( 1 ) var nodeUniform2_sampler : sampler;
@binding( 2 ) @group( 1 ) var nodeUniform2 : texture_2d<f32>;
@binding( 4 ) @group( 1 ) var nodeUniform4_sampler : sampler;
@binding( 5 ) @group( 1 ) var nodeUniform4 : texture_2d<f32>;
@binding( 6 ) @group( 1 ) var nodeUniform11_sampler : sampler;
@binding( 7 ) @group( 1 ) var nodeUniform11 : texture_2d<f32>;
@binding( 8 ) @group( 1 ) var nodeUniform18_sampler : sampler_comparison;
@binding( 9 ) @group( 1 ) var nodeUniform18 : texture_depth_2d;
@binding( 10 ) @group( 1 ) var nodeUniform23_sampler : sampler;
@binding( 11 ) @group( 1 ) var nodeUniform23 : texture_2d<f32>;
@binding( 12 ) @group( 1 ) var nodeUniform29_sampler : sampler;
@binding( 13 ) @group( 1 ) var nodeUniform29 : texture_2d<f32>;
@binding( 14 ) @group( 1 ) var nodeUniform32_sampler : sampler;
@binding( 15 ) @group( 1 ) var nodeUniform32 : texture_2d<f32>;

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

// vars
var<private> DiffuseColor : vec4<f32>;
var<private> nodeVar10 : vec4<f32>;
var<private> nodeVar11 : vec4<f32>;
var<private> nodeVar12 : vec4<f32>;
var<private> nodeVar15 : vec3<f32>;
var<private> nodeVar16 : vec3<f32>;
var<private> AmbientOcclusion : f32;
var<private> nodeVar17 : vec4<f32>;
var<private> nodeVar18 : vec4<f32>;
var<private> Metalness : f32;
var<private> Roughness : f32;
var<private> normalViewGeometry : vec3<f32>;
var<private> nodeVar19 : vec3<f32>;
var<private> SpecularColor : vec3<f32>;
var<private> SpecularColorBlended : vec3<f32>;
var<private> SpecularF90 : f32;
var<private> DiffuseContribution : vec3<f32>;
var<private> EmissiveColor : vec3<f32>;
var<private> Output : vec4<f32>;
var<private> nodeVar20 : vec3<f32>;
var<private> nodeVar21 : f32;
var<private> nodeVar22 : vec3<f32>;
var<private> nodeVar23 : vec3<f32>;
var<private> nodeVar26 : f32;
var<private> nodeVar27 : vec3<f32>;
var<private> nodeVar28 : bool;
var<private> nodeVar29 : vec3<f32>;
var<private> nodeVar34 : f32;
var<private> nodeVar35 : vec3<f32>;
var<private> nodeVar36 : vec3<f32>;
var<private> nodeVar37 : vec3<f32>;
var<private> nodeVar38 : f32;
var<private> nodeVar39 : vec3<f32>;
var<private> nodeVar40 : vec3<f32>;
var<private> nodeVar41 : vec4<f32>;
var<private> nodeVar42 : vec3<f32>;
var<private> nodeVar43 : vec3<f32>;
var<private> nodeVar44 : f32;
var<private> nodeVar45 : vec3<f32>;
var<private> nodeVar46 : vec3<f32>;
var<private> nodeVar47 : vec3<f32>;
var<private> nodeVar48 : f32;
var<private> nodeVar49 : vec3<f32>;
var<private> normalView : vec3<f32>;
var<private> nodeVar50 : vec3<f32>;
var<private> nodeVar51 : vec4<f32>;
var<private> nodeVar52 : vec4<f32>;
var<private> nodeVar53 : vec3<f32>;
var<private> nodeVar54 : vec3<f32>;
var<private> nodeVar55 : f32;
var<private> shadowPositionWorld : vec3<f32>;
var<private> nodeVar56 : f32;
var<private> normalWorld : vec3<f32>;
var<private> nodeVar57 : vec4<f32>;
var<private> nodeVar58 : vec3<f32>;
var<private> nodeVar59 : vec3<f32>;
var<private> nodeVar60 : f32;
var<private> nodeVar61 : f32;
var<private> nodeVar62 : vec2<f32>;
var<private> nodeVar63 : f32;
var<private> nodeVar64 : vec2<f32>;
var<private> nodeVar65 : f32;
var<private> nodeVar66 : vec2<f32>;
var<private> nodeVar67 : f32;
var<private> nodeVar68 : vec2<f32>;
var<private> nodeVar69 : f32;
var<private> nodeVar70 : vec2<f32>;
var<private> nodeVar71 : f32;
var<private> nodeVar72 : f32;
var<private> nodeVar73 : vec3<f32>;
var<private> nodeVar74 : vec3<f32>;
var<private> directDiffuse : vec3<f32>;
var<private> nodeVar75 : vec3<f32>;
var<private> nodeVar76 : vec3<f32>;
var<private> nodeVar77 : vec3<f32>;
var<private> directSpecular : vec3<f32>;
var<private> positionViewDirection : vec3<f32>;
var<private> nodeVar78 : vec3<f32>;
var<private> nodeVar79 : f32;
var<private> nodeVar80 : f32;
var<private> nodeVar81 : f32;
var<private> nodeVar82 : vec4<f32>;
var<private> nodeVar83 : vec4<f32>;
var<private> nodeVar84 : vec3<f32>;
var<private> nodeVar85 : f32;
var<private> nodeVar86 : f32;
var<private> nodeVar87 : vec3<f32>;
var<private> nodeVar88 : vec3<f32>;
var<private> nodeVar89 : vec3<f32>;
var<private> radiance : vec3<f32>;
var<private> nodeVar90 : f32;
var<private> nodeVar91 : f32;
var<private> nodeVar92 : f32;
var<private> nodeVar93 : vec3<f32>;
var<private> nodeVar94 : f32;
var<private> nodeVar95 : f32;
var<private> nodeVar96 : f32;
var<private> nodeVar97 : vec2<f32>;
var<private> nodeVar98 : vec4<f32>;
var<private> nodeVar99 : vec3<f32>;
var<private> nodeVar100 : f32;
var<private> nodeVar101 : f32;
var<private> nodeVar102 : f32;
var<private> nodeVar103 : f32;
var<private> nodeVar104 : f32;
var<private> nodeVar105 : vec2<f32>;
var<private> nodeVar106 : vec4<f32>;
var<private> nodeVar107 : vec3<f32>;
var<private> nodeVar108 : vec3<f32>;
var<private> iblIrradiance : vec3<f32>;
var<private> nodeVar109 : f32;
var<private> nodeVar110 : f32;
var<private> nodeVar111 : f32;
var<private> nodeVar112 : f32;
var<private> nodeVar113 : f32;
var<private> nodeVar114 : f32;
var<private> nodeVar115 : vec2<f32>;
var<private> nodeVar116 : vec4<f32>;
var<private> nodeVar117 : vec3<f32>;
var<private> nodeVar118 : f32;
var<private> nodeVar119 : f32;
var<private> nodeVar120 : f32;
var<private> nodeVar121 : f32;
var<private> nodeVar122 : f32;
var<private> nodeVar123 : vec2<f32>;
var<private> nodeVar124 : vec4<f32>;
var<private> nodeVar125 : vec3<f32>;
var<private> nodeVar126 : vec3<f32>;
var<private> ambientOcclusion : f32;
var<private> nodeVar127 : f32;
var<private> irradiance : vec3<f32>;
var<private> nodeVar128 : vec3<f32>;
var<private> nodeVar129 : vec3<f32>;
var<private> nodeVar130 : vec3<f32>;
var<private> indirectDiffuse : vec3<f32>;
var<private> nodeVar131 : vec3<f32>;
var<private> singleScatteringDielectric : vec3<f32>;
var<private> multiScatteringDielectric : vec3<f32>;
var<private> singleScatteringMetallic : vec3<f32>;
var<private> multiScatteringMetallic : vec3<f32>;
var<private> nodeVar132 : f32;
var<private> nodeVar133 : vec4<f32>;
var<private> nodeVar134 : vec3<f32>;
var<private> nodeVar135 : f32;
var<private> nodeVar136 : vec3<f32>;
var<private> nodeVar137 : vec3<f32>;
var<private> nodeVar138 : vec3<f32>;
var<private> nodeVar139 : vec3<f32>;
var<private> nodeVar140 : vec3<f32>;
var<private> nodeVar141 : vec3<f32>;
var<private> nodeVar142 : vec3<f32>;
var<private> nodeVar143 : f32;
var<private> nodeVar144 : f32;
var<private> nodeVar145 : f32;
var<private> nodeVar146 : vec3<f32>;
var<private> nodeVar147 : vec3<f32>;
var<private> nodeVar148 : vec3<f32>;
var<private> nodeVar149 : vec3<f32>;
var<private> nodeVar150 : vec3<f32>;
var<private> nodeVar151 : vec3<f32>;
var<private> nodeVar152 : f32;
var<private> nodeVar153 : vec4<f32>;
var<private> nodeVar154 : vec3<f32>;
var<private> nodeVar155 : f32;
var<private> nodeVar156 : vec3<f32>;
var<private> nodeVar157 : vec3<f32>;
var<private> nodeVar158 : vec3<f32>;
var<private> nodeVar159 : vec3<f32>;
var<private> nodeVar160 : vec3<f32>;
var<private> nodeVar161 : vec3<f32>;
var<private> nodeVar162 : vec3<f32>;
var<private> nodeVar163 : f32;
var<private> nodeVar164 : f32;
var<private> nodeVar165 : f32;
var<private> nodeVar166 : vec3<f32>;
var<private> nodeVar167 : vec3<f32>;
var<private> nodeVar168 : vec3<f32>;
var<private> nodeVar169 : vec3<f32>;
var<private> nodeVar170 : vec3<f32>;
var<private> nodeVar171 : vec3<f32>;
var<private> nodeVar172 : vec3<f32>;
var<private> nodeVar173 : vec3<f32>;
var<private> nodeVar174 : vec3<f32>;
var<private> nodeVar175 : vec3<f32>;
var<private> nodeVar176 : vec3<f32>;
var<private> nodeVar177 : vec3<f32>;
var<private> nodeVar178 : vec3<f32>;
var<private> nodeVar179 : vec3<f32>;
var<private> nodeVar180 : vec3<f32>;
var<private> nodeVar181 : vec3<f32>;
var<private> nodeVar182 : vec3<f32>;
var<private> nodeVar183 : vec3<f32>;
var<private> nodeVar184 : vec3<f32>;
var<private> indirectSpecular : vec3<f32>;
var<private> nodeVar185 : vec3<f32>;
var<private> nodeVar186 : vec3<f32>;
var<private> nodeVar187 : vec3<f32>;
var<private> nodeVar188 : f32;
var<private> nodeVar189 : f32;
var<private> nodeVar190 : f32;
var<private> nodeVar191 : f32;
var<private> nodeVar192 : f32;
var<private> nodeVar193 : f32;
var<private> nodeVar194 : f32;
var<private> nodeVar195 : f32;
var<private> nodeVar196 : f32;
var<private> nodeVar197 : f32;
var<private> nodeVar198 : f32;
var<private> nodeVar199 : vec3<f32>;
var<private> totalDiffuse : vec3<f32>;
var<private> nodeVar200 : vec3<f32>;
var<private> totalSpecular : vec3<f32>;
var<private> nodeVar201 : vec3<f32>;
var<private> outgoingLight : vec3<f32>;
var<private> nodeVar202 : vec3<f32>;
var<private> nodeVar203 : vec3<f32>;
var<private> nodeVar204 : f32;
var<private> nodeVar205 : f32;
var<private> nodeVar206 : f32;
var<private> nodeVar207 : f32;
var<private> nodeVar208 : vec3<f32>;
var<private> nodeVar209 : vec3<f32>;
var<private> nodeVar210 : vec4<f32>;
var<private> nodeVar211 : vec3<f32>;
var<private> nodeVar212 : vec3<f32>;
var<private> nodeVar213 : vec4<f32>;
var<private> nodeVar214 : vec4<f32>;

// codes
fn sRGBTransferEOTF ( color : vec3<f32> ) -> vec3<f32> {

	


	return mix( pow( ( ( color * vec3<f32>( 0.9478672986 ) ) + vec3<f32>( 0.0521327014 ) ), vec3<f32>( 2.4 ) ), ( color * vec3<f32>( 0.0773993808 ) ), vec3<f32>( ( color <= vec3<f32>( 0.04045 ) ) ) );

}

fn interleavedGradientNoise ( position : vec2<f32> ) -> f32 {

	


	return fract( ( 52.9829189 * fract( dot( position, vec2<f32>( 0.06711056, 0.00583715 ) ) ) ) );

}

fn vogelDiskSample ( sampleIndex : i32, samplesCount : i32, phi : f32 ) -> vec2<f32> {

	var nodeVar0 : f32;

	nodeVar0 = ( ( f32( sampleIndex ) * 2.399963229728653 ) + phi );

	return ( vec2<f32>( cos( nodeVar0 ), sin( nodeVar0 ) ) * vec2<f32>( sqrt( ( ( f32( sampleIndex ) + 0.5 ) / f32( samplesCount ) ) ) ) );

}

fn V_GGX_SmithCorrelated ( alpha : f32, dotNL : f32, dotNV : f32 ) -> f32 {

	var nodeVar0 : f32;

	nodeVar0 = ( alpha * alpha );

	return ( 0.5 / max( ( ( dotNL * sqrt( ( nodeVar0 + ( ( 1.0 - nodeVar0 ) * ( dotNV * dotNV ) ) ) ) ) + ( dotNV * sqrt( ( nodeVar0 + ( ( 1.0 - nodeVar0 ) * ( dotNL * dotNL ) ) ) ) ) ), 0.000001 ) );

}

fn D_GGX ( alpha : f32, dotNH : f32 ) -> f32 {

	var nodeVar0 : f32;
	var nodeVar1 : f32;

	nodeVar0 = ( alpha * alpha );
	nodeVar1 = ( 1.0 - ( ( dotNH * dotNH ) * ( 1.0 - nodeVar0 ) ) );

	return ( ( nodeVar0 / ( nodeVar1 * nodeVar1 ) ) * 0.3183098861837907 );

}

fn roughnessToMip ( roughness : f32 ) -> f32 {

	var nodeVar0 : f32;

	nodeVar0 = 0.0;

	if ( ( roughness >= 0.8 ) ) {

		nodeVar0 = ( ( ( ( 1.0 - roughness ) * ( -1.0 - -2.0 ) ) / ( 1.0 - 0.8 ) ) + -2.0 );
		

	} else {


		if ( ( roughness >= 0.4 ) ) {

			nodeVar0 = ( ( ( ( 0.8 - roughness ) * ( 2.0 - -1.0 ) ) / ( 0.8 - 0.4 ) ) + -1.0 );
			

		} else {


			if ( ( roughness >= 0.305 ) ) {

				nodeVar0 = ( ( ( ( 0.4 - roughness ) * ( 3.0 - 2.0 ) ) / ( 0.4 - 0.305 ) ) + 2.0 );
				

			} else {


				if ( ( roughness >= 0.21 ) ) {

					nodeVar0 = ( ( ( ( 0.305 - roughness ) * ( 4.0 - 3.0 ) ) / ( 0.305 - 0.21 ) ) + 3.0 );
					

				} else {

					nodeVar0 = ( -2.0 * log2( ( 1.16 * roughness ) ) );
					

				}

				

			}

			

		}

		

	}


	return nodeVar0;

}

fn getFace ( direction : vec3<f32> ) -> f32 {

	var nodeVar0 : vec3<f32>;
	var nodeVar1 : f32;
	var nodeVar2 : f32;
	var nodeVar3 : f32;
	var nodeVar4 : f32;
	var nodeVar5 : f32;

	nodeVar0 = abs( direction );
	nodeVar1 = -1.0;

	if ( ( nodeVar0.x > nodeVar0.z ) ) {


		if ( ( nodeVar0.x > nodeVar0.y ) ) {


			if ( ( direction.x > 0.0 ) ) {

				nodeVar2 = 0.0;

			} else {

				nodeVar2 = 3.0;

			}

			nodeVar1 = nodeVar2;
			

		} else {


			if ( ( direction.y > 0.0 ) ) {

				nodeVar3 = 1.0;

			} else {

				nodeVar3 = 4.0;

			}

			nodeVar1 = nodeVar3;
			

		}

		

	} else {


		if ( ( nodeVar0.z > nodeVar0.y ) ) {


			if ( ( direction.z > 0.0 ) ) {

				nodeVar4 = 2.0;

			} else {

				nodeVar4 = 5.0;

			}

			nodeVar1 = nodeVar4;
			

		} else {


			if ( ( direction.y > 0.0 ) ) {

				nodeVar5 = 1.0;

			} else {

				nodeVar5 = 4.0;

			}

			nodeVar1 = nodeVar5;
			

		}

		

	}


	return nodeVar1;

}

fn getUV ( direction : vec3<f32>, face : f32 ) -> vec2<f32> {

	var nodeVar0 : vec2<f32>;

	nodeVar0 = vec2<f32>( 0.0, 0.0 );

	if ( ( face == 0.0 ) ) {

		nodeVar0 = ( vec2<f32>( direction.z, direction.y ) / vec2<f32>( abs( direction.x ) ) );
		

	} else {


		if ( ( face == 1.0 ) ) {

			nodeVar0 = ( vec2<f32>( ( - direction.x ), ( - direction.z ) ) / vec2<f32>( abs( direction.y ) ) );
			

		} else {


			if ( ( face == 2.0 ) ) {

				nodeVar0 = ( vec2<f32>( ( - direction.x ), direction.y ) / vec2<f32>( abs( direction.z ) ) );
				

			} else {


				if ( ( face == 3.0 ) ) {

					nodeVar0 = ( vec2<f32>( ( - direction.z ), direction.y ) / vec2<f32>( abs( direction.x ) ) );
					

				} else {


					if ( ( face == 4.0 ) ) {

						nodeVar0 = ( vec2<f32>( ( - direction.x ), direction.z ) / vec2<f32>( abs( direction.y ) ) );
						

					} else {

						nodeVar0 = ( vec2<f32>( direction.x, direction.y ) / vec2<f32>( abs( direction.z ) ) );
						

					}

					

				}

				

			}

			

		}

		

	}


	return ( vec2<f32>( 0.5 ) * ( nodeVar0 + vec2<f32>( 1.0 ) ) );

}



@fragment
fn main( @location( 0 ) @interpolate( flat ) nodeVarying3 : i32,
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
	@builtin( front_facing ) isFront : bool,
	@builtin( position ) fragCoord : vec4<f32> ) -> OutputStruct {

	// flow
	// code

	nodeVar10 = textureLoad( nodeUniform1, vec2<i32>( nodeVarying3, i32( 0.0 ) ), u32( 0u ) );
	nodeVar11 = textureSample( nodeUniform2, nodeUniform2_sampler, nodeVarying14 );
	nodeVar12 = textureLoad( nodeUniform1, vec2<i32>( nodeVarying3, i32( 2.0 ) ), u32( 0u ) );
	nodeVar15 = mix( ( ( nodeVarying13.xyz * nodeVar10.xyz ) * mix( vec3<f32>( 1.0, 1.0, 1.0 ), nodeVar11.xyz, nodeVar12.x ) ), mix( mix( mix( sRGBTransferEOTF( vec3<f32>( 0.15, 0.38, 0.96 ) ), sRGBTransferEOTF( vec3<f32>( 0.94, 0.15, 0.12 ) ), step( 0.5, nodeVarying4.x ) ), sRGBTransferEOTF( vec3<f32>( 0.82, 0.7, 0.34 ) ), step( 1.5, nodeVarying4.x ) ), sRGBTransferEOTF( vec3<f32>( 0.42, 0.34, 0.26 ) ), 0.35 ), clamp( nodeVarying15, 0.0, 1.0 ) );
	nodeVar16 = mix( nodeVar15, ( ( vec3<f32>( dot( nodeVar15, vec3<f32>( 0.3, 0.59, 0.11 ) ) ) * vec3<f32>( 0.62 ) ) + vec3<f32>( 0.06, 0.04, 0.03 ) ), ( nodeVarying4.y * 0.7 ) );
	DiffuseColor = vec4<f32>( clamp( nodeVar16, vec3<f32>( 0.0, 0.0, 0.0 ), vec3<f32>( 1.0, 1.0, 1.0 ) ), 1.0 );
	DiffuseColor.w = ( DiffuseColor.w * object.nodeUniform3 );
	DiffuseColor.w = 1.0;
	nodeVar17 = textureSample( nodeUniform4, nodeUniform4_sampler, nodeVarying14 );
	nodeVar18 = textureLoad( nodeUniform1, vec2<i32>( nodeVarying3, i32( 1.0 ) ), u32( 0u ) );
	AmbientOcclusion = ( mix( 1.0, nodeVar17.xyz.x, ( nodeVar12.w * nodeVar18.z ) ) * nodeVarying4.z );
	Metalness = ( nodeVar18.y * mix( 1.0, nodeVar17.xyz.z, nodeVar12.z ) );
	normalViewGeometry = normalize( v_normalViewGeometry );
	nodeVar19 = max( abs( dpdx( normalViewGeometry ) ), abs( - dpdy( normalViewGeometry ) ) );
	Roughness = min( ( max( ( nodeVar18.x * mix( 1.0, nodeVar17.xyz.y, nodeVar12.z ) ), 0.0525 ) + max( max( nodeVar19.x, nodeVar19.y ), nodeVar19.z ) ), 1.0 );
	SpecularColor = vec3<f32>( 0.04, 0.04, 0.04 );
	SpecularColorBlended = mix( vec3<f32>( 0.04, 0.04, 0.04 ), DiffuseColor.xyz, Metalness );
	SpecularF90 = 1.0;
	DiffuseContribution = ( DiffuseColor.xyz * vec3<f32>( ( 1.0 - ( nodeVar18.y * mix( 1.0, nodeVar17.xyz.z, nodeVar12.z ) ) ) ) );
	EmissiveColor = ( object.nodeUniform7 * vec3<f32>( object.nodeUniform8 ) );
	nodeVar20 = ( cross( dpdx( nodeVarying6 ), - dpdy( nodeVarying6 ) ) * vec3<f32>( ( ( f32( isFront ) * 2.0 ) - 1.0 ) ) );
	nodeVar21 = max( max( abs( nodeVar20.x ), abs( nodeVar20.y ) ), abs( nodeVar20.z ) );
	nodeVar22 = ( nodeVar20 / vec3<f32>( max( nodeVar21, f32( ( nodeVar21 == 0.0 ) ) ) ) );
	nodeVar23 = mix( vec3<f32>( 0.0, 0.0, 1.0 ), ( nodeVar22 / vec3<f32>( sqrt( max( dot( nodeVar22, nodeVar22 ), 1e-12 ) ) ) ), f32( ( nodeVar21 > 0.0 ) ) );
	nodeVar26 = max( max( abs( nodeVarying7.x ), abs( nodeVarying7.y ) ), abs( nodeVarying7.z ) );
	nodeVar27 = ( nodeVarying7 / vec3<f32>( max( nodeVar26, f32( ( nodeVar26 == 0.0 ) ) ) ) );
	nodeVar28 = ( dot( nodeVarying7, nodeVarying7 ) > 1e-12 );
	nodeVar29 = mix( nodeVar23, mix( nodeVar23, ( nodeVar27 / vec3<f32>( sqrt( max( dot( nodeVar27, nodeVar27 ), 1e-12 ) ) ) ), f32( ( nodeVar26 > 0.0 ) ) ), f32( nodeVar28 ) );
	nodeVar34 = max( max( abs( nodeVarying8.x ), abs( nodeVarying8.y ) ), abs( nodeVarying8.z ) );
	nodeVar35 = ( nodeVarying8 / vec3<f32>( max( nodeVar34, f32( ( nodeVar34 == 0.0 ) ) ) ) );
	nodeVar36 = mix( vec3<f32>( 0.0, 0.0, 0.0 ), ( nodeVar35 / vec3<f32>( sqrt( max( dot( nodeVar35, nodeVar35 ), 1e-12 ) ) ) ), f32( ( nodeVar34 > 0.0 ) ) );
	nodeVar37 = ( nodeVar36 - ( nodeVar29 * vec3<f32>( dot( nodeVar29, nodeVar36 ) ) ) );
	nodeVar38 = max( max( abs( nodeVar37.x ), abs( nodeVar37.y ) ), abs( nodeVar37.z ) );
	nodeVar39 = ( nodeVar37 / vec3<f32>( max( nodeVar38, f32( ( nodeVar38 == 0.0 ) ) ) ) );
	nodeVar40 = mix( vec3<f32>( 0.0, 0.0, 0.0 ), ( nodeVar39 / vec3<f32>( sqrt( max( dot( nodeVar39, nodeVar39 ), 1e-12 ) ) ) ), f32( ( nodeVar38 > 0.0 ) ) );
	nodeVar41 = textureSample( nodeUniform11, nodeUniform11_sampler, nodeVarying14 );
	nodeVar42 = ( ( nodeVar41.xyz * vec3<f32>( 2.0 ) ) - vec3<f32>( 1.0 ) );
	nodeVar43 = vec3<f32>( ( nodeVar42.xy * vec2<f32>( nodeVar18.w ) ), nodeVar42.z );
	nodeVar44 = max( max( abs( nodeVar43.x ), abs( nodeVar43.y ) ), abs( nodeVar43.z ) );
	nodeVar45 = ( nodeVar43 / vec3<f32>( max( nodeVar44, f32( ( nodeVar44 == 0.0 ) ) ) ) );
	nodeVar46 = mix( vec3<f32>( 0.0, 0.0, 1.0 ), ( nodeVar45 / vec3<f32>( sqrt( max( dot( nodeVar45, nodeVar45 ), 1e-12 ) ) ) ), f32( ( nodeVar44 > 0.0 ) ) );
	nodeVar47 = ( ( ( nodeVar40 * vec3<f32>( nodeVar46.x ) ) + ( ( cross( nodeVar29, nodeVar40 ) * vec3<f32>( nodeVarying9 ) ) * vec3<f32>( nodeVar46.y ) ) ) + ( nodeVar29 * vec3<f32>( nodeVar46.z ) ) );
	nodeVar48 = max( max( abs( nodeVar47.x ), abs( nodeVar47.y ) ), abs( nodeVar47.z ) );
	nodeVar49 = ( nodeVar47 / vec3<f32>( max( nodeVar48, f32( ( nodeVar48 == 0.0 ) ) ) ) );
	normalView = normalize( ( render.cameraViewMatrix * vec4<f32>( ( object.nodeUniform10 * mix( nodeVar29, mix( nodeVar29, ( nodeVar49 / vec3<f32>( sqrt( max( dot( nodeVar49, nodeVar49 ), 1e-12 ) ) ) ), f32( ( nodeVar48 > 0.0 ) ) ), f32( ( ( ( ( nodeVar12.y > 0.0 ) && nodeVar28 ) && ( dot( nodeVarying8, nodeVarying8 ) > 1e-12 ) ) && ( dot( nodeVar37, nodeVar37 ) > 1e-12 ) ) ) ) ), 0.0 ) ).xyz );
	nodeVar50 = ( render.nodeUniform12 - render.nodeUniform13 );
	nodeVar51 = vec4<f32>( nodeVar50, 0.0 );
	nodeVar52 = ( render.cameraViewMatrix * nodeVar51 );
	nodeVar53 = normalize( nodeVar52.xyz );
	nodeVar54 = nodeVar53;
	nodeVar55 = dot( normalView, nodeVar54 );
	shadowPositionWorld = nodeVarying6;
	normalWorld = normalize( ( vec4<f32>( normalView, 0.0 ) * render.cameraViewMatrix ).xyz );
	nodeVar57 = ( render.nodeUniform15 * vec4<f32>( ( shadowPositionWorld + ( normalWorld * vec3<f32>( render.nodeUniform16 ) ) ), 1.0 ) );
	nodeVar58 = ( nodeVar57.xyz / vec3<f32>( nodeVar57.w ) );
	nodeVar59 = vec3<f32>( nodeVar58.x, ( 1.0 - nodeVar58.y ), ( nodeVar58.z - render.nodeUniform17 ) );

	if ( ( ( ( ( ( nodeVar59.x >= 0.0 ) && ( nodeVar59.x <= 1.0 ) ) && ( nodeVar59.y >= 0.0 ) ) && ( nodeVar59.y <= 1.0 ) ) && ( nodeVar59.z <= 1.0 ) ) ) {

		nodeVar60 = ( interleavedGradientNoise( fragCoord.xy ) * 6.28318530718 );
		nodeVar61 = ( render.nodeUniform19 * ( vec2<f32>( 1.0, 1.0 ) / render.nodeUniform20 ).x );
		nodeVar62 = ( nodeVar59.xy + ( vogelDiskSample( 0, 5, nodeVar60 ) * vec2<f32>( nodeVar61 ) ) );
		nodeVar63 = textureSampleCompare( nodeUniform18, nodeUniform18_sampler, nodeVar62, nodeVar59.z );
		nodeVar64 = ( nodeVar59.xy + ( vogelDiskSample( 1, 5, nodeVar60 ) * vec2<f32>( nodeVar61 ) ) );
		nodeVar65 = textureSampleCompare( nodeUniform18, nodeUniform18_sampler, nodeVar64, nodeVar59.z );
		nodeVar66 = ( nodeVar59.xy + ( vogelDiskSample( 2, 5, nodeVar60 ) * vec2<f32>( nodeVar61 ) ) );
		nodeVar67 = textureSampleCompare( nodeUniform18, nodeUniform18_sampler, nodeVar66, nodeVar59.z );
		nodeVar68 = ( nodeVar59.xy + ( vogelDiskSample( 3, 5, nodeVar60 ) * vec2<f32>( nodeVar61 ) ) );
		nodeVar69 = textureSampleCompare( nodeUniform18, nodeUniform18_sampler, nodeVar68, nodeVar59.z );
		nodeVar70 = ( nodeVar59.xy + ( vogelDiskSample( 4, 5, nodeVar60 ) * vec2<f32>( nodeVar61 ) ) );
		nodeVar71 = textureSampleCompare( nodeUniform18, nodeUniform18_sampler, nodeVar70, nodeVar59.z );
		nodeVar56 = ( ( ( ( ( nodeVar63 + nodeVar65 ) + nodeVar67 ) + nodeVar69 ) + nodeVar71 ) * 0.2 );

	} else {

		nodeVar56 = 1.0;

	}

	nodeVar72 = mix( 1.0, nodeVar56, render.nodeUniform21 );
	nodeVar73 = ( vec3<f32>( clamp( nodeVar55, 0.0, 1.0 ) ) * ( render.nodeUniform14 * vec3<f32>( nodeVar72 ) ) );
	nodeVar74 = nodeVar73;
	directDiffuse = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar75 = ( DiffuseContribution * vec3<f32>( 0.3183098861837907 ) );
	nodeVar76 = ( nodeVar74 * nodeVar75 );
	nodeVar77 = ( directDiffuse + nodeVar76 );
	directDiffuse = nodeVar77;
	directSpecular = vec3<f32>( 0.0, 0.0, 0.0 );
	positionViewDirection = normalize( v_positionViewDirection );
	nodeVar78 = normalize( ( nodeVar54 + positionViewDirection ) );
	nodeVar79 = clamp( dot( positionViewDirection, nodeVar78 ), 0.0, 1.0 );
	nodeVar80 = exp2( ( ( ( nodeVar79 * -5.55473 ) - 6.98316 ) * nodeVar79 ) );
	nodeVar81 = ( Roughness * Roughness );
	nodeVar82 = textureSample( nodeUniform23, nodeUniform23_sampler, vec2<f32>( Roughness, clamp( dot( normalView, positionViewDirection ), 0.0, 1.0 ) ) );
	nodeVar83 = textureSample( nodeUniform23, nodeUniform23_sampler, vec2<f32>( Roughness, clamp( dot( normalView, nodeVar54 ), 0.0, 1.0 ) ) );
	nodeVar84 = ( SpecularColorBlended + ( ( vec3<f32>( 1.0 ) - SpecularColorBlended ) * vec3<f32>( 0.047619 ) ) );
	nodeVar85 = ( 1.0 - ( nodeVar82.xy.x + nodeVar82.xy.y ) );
	nodeVar86 = ( 1.0 - ( nodeVar83.xy.x + nodeVar83.xy.y ) );
	nodeVar87 = ( ( ( ( ( SpecularColorBlended * vec3<f32>( ( 1.0 - nodeVar80 ) ) ) + vec3<f32>( ( 1.0 * nodeVar80 ) ) ) * vec3<f32>( V_GGX_SmithCorrelated( nodeVar81, clamp( dot( normalView, nodeVar54 ), 0.0, 1.0 ), clamp( dot( normalView, positionViewDirection ), 0.0, 1.0 ) ) ) ) * vec3<f32>( D_GGX( nodeVar81, clamp( dot( normalView, nodeVar78 ), 0.0, 1.0 ) ) ) ) + ( ( ( ( ( ( SpecularColorBlended * vec3<f32>( nodeVar82.xy.x ) ) + vec3<f32>( ( 1.0 * nodeVar82.xy.y ) ) ) * ( ( SpecularColorBlended * vec3<f32>( nodeVar83.xy.x ) ) + vec3<f32>( ( 1.0 * nodeVar83.xy.y ) ) ) ) * nodeVar84 ) / ( ( vec3<f32>( 1.0 ) - ( ( vec3<f32>( ( nodeVar85 * nodeVar86 ) ) * nodeVar84 ) * nodeVar84 ) ) + vec3<f32>( 0.000001 ) ) ) * vec3<f32>( ( nodeVar85 * nodeVar86 ) ) ) );
	nodeVar88 = ( nodeVar74 * nodeVar87 );
	nodeVar89 = ( directSpecular + nodeVar88 );
	directSpecular = nodeVar89;
	radiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar90 = clamp( roughnessToMip( Roughness ), -2.0, object.nodeUniform24 );
	nodeVar91 = floor( nodeVar90 );
	nodeVar92 = nodeVar91;
	nodeVar93 = normalize( ( render.cameraWorldMatrix * vec4<f32>( normalize( mix( reflect( ( - positionViewDirection ), normalView ), normalView, ( ( ( Roughness * Roughness ) * Roughness ) * Roughness ) ) ), 0.0 ) ).xyz );
	nodeVar94 = getFace( ( object.nodeUniform25 * vec4<f32>( vec3<f32>( nodeVar93.x, ( - nodeVar93.y ), nodeVar93.z ), 1.0 ) ).xyz );
	nodeVar95 = max( ( 4.0 - nodeVar92 ), 0.0 );
	nodeVar92 = max( nodeVar92, 4.0 );
	nodeVar96 = exp2( nodeVar92 );
	nodeVar97 = ( ( getUV( ( object.nodeUniform25 * vec4<f32>( vec3<f32>( nodeVar93.x, ( - nodeVar93.y ), nodeVar93.z ), 1.0 ) ).xyz, nodeVar94 ) * vec2<f32>( ( nodeVar96 - 2.0 ) ) ) + vec2<f32>( 1.0 ) );

	if ( ( nodeVar94 > 2.0 ) ) {

		nodeVar97.y = ( nodeVar97.y + nodeVar96 );
		nodeVar94 = ( nodeVar94 - 3.0 );
		

	}

	nodeVar97.x = ( nodeVar97.x + ( nodeVar94 * nodeVar96 ) );
	nodeVar97.x = ( nodeVar97.x + ( nodeVar95 * ( 3.0 * 16.0 ) ) );
	nodeVar97.y = ( nodeVar97.y + ( 4.0 * ( exp2( object.nodeUniform24 ) - nodeVar96 ) ) );
	nodeVar97.x = ( nodeVar97.x * object.nodeUniform27 );
	nodeVar97.y = ( nodeVar97.y * object.nodeUniform28 );
	nodeVar98 = textureSampleGrad( nodeUniform29, nodeUniform29_sampler, nodeVar97, vec2<f32>( 0.0, 0.0 ), vec2<f32>( 0.0, 0.0 ) );
	nodeVar99 = nodeVar98.xyz;
	nodeVar100 = fract( nodeVar90 );

	if ( ( nodeVar100 != 0.0 ) ) {

		nodeVar101 = ( nodeVar91 + 1.0 );
		nodeVar102 = getFace( ( object.nodeUniform25 * vec4<f32>( vec3<f32>( nodeVar93.x, ( - nodeVar93.y ), nodeVar93.z ), 1.0 ) ).xyz );
		nodeVar103 = max( ( 4.0 - nodeVar101 ), 0.0 );
		nodeVar101 = max( nodeVar101, 4.0 );
		nodeVar104 = exp2( nodeVar101 );
		nodeVar105 = ( ( getUV( ( object.nodeUniform25 * vec4<f32>( vec3<f32>( nodeVar93.x, ( - nodeVar93.y ), nodeVar93.z ), 1.0 ) ).xyz, nodeVar102 ) * vec2<f32>( ( nodeVar104 - 2.0 ) ) ) + vec2<f32>( 1.0 ) );

		if ( ( nodeVar102 > 2.0 ) ) {

			nodeVar105.y = ( nodeVar105.y + nodeVar104 );
			nodeVar102 = ( nodeVar102 - 3.0 );
			

		}

		nodeVar105.x = ( nodeVar105.x + ( nodeVar102 * nodeVar104 ) );
		nodeVar105.x = ( nodeVar105.x + ( nodeVar103 * ( 3.0 * 16.0 ) ) );
		nodeVar105.y = ( nodeVar105.y + ( 4.0 * ( exp2( object.nodeUniform24 ) - nodeVar104 ) ) );
		nodeVar105.x = ( nodeVar105.x * object.nodeUniform27 );
		nodeVar105.y = ( nodeVar105.y * object.nodeUniform28 );
		nodeVar106 = textureSampleGrad( nodeUniform29, nodeUniform29_sampler, nodeVar105, vec2<f32>( 0.0, 0.0 ), vec2<f32>( 0.0, 0.0 ) );
		nodeVar107 = nodeVar106.xyz;
		nodeVar99 = mix( nodeVar99, nodeVar107, nodeVar100 );
		

	}

	nodeVar108 = ( radiance + ( nodeVar99 * vec3<f32>( object.nodeUniform30 ) ) );
	radiance = nodeVar108;
	iblIrradiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar109 = clamp( roughnessToMip( 1.0 ), -2.0, object.nodeUniform24 );
	nodeVar110 = floor( nodeVar109 );
	nodeVar111 = nodeVar110;
	nodeVar112 = getFace( ( object.nodeUniform25 * vec4<f32>( vec3<f32>( normalWorld.x, ( - normalWorld.y ), normalWorld.z ), 1.0 ) ).xyz );
	nodeVar113 = max( ( 4.0 - nodeVar111 ), 0.0 );
	nodeVar111 = max( nodeVar111, 4.0 );
	nodeVar114 = exp2( nodeVar111 );
	nodeVar115 = ( ( getUV( ( object.nodeUniform25 * vec4<f32>( vec3<f32>( normalWorld.x, ( - normalWorld.y ), normalWorld.z ), 1.0 ) ).xyz, nodeVar112 ) * vec2<f32>( ( nodeVar114 - 2.0 ) ) ) + vec2<f32>( 1.0 ) );

	if ( ( nodeVar112 > 2.0 ) ) {

		nodeVar115.y = ( nodeVar115.y + nodeVar114 );
		nodeVar112 = ( nodeVar112 - 3.0 );
		

	}

	nodeVar115.x = ( nodeVar115.x + ( nodeVar112 * nodeVar114 ) );
	nodeVar115.x = ( nodeVar115.x + ( nodeVar113 * ( 3.0 * 16.0 ) ) );
	nodeVar115.y = ( nodeVar115.y + ( 4.0 * ( exp2( object.nodeUniform24 ) - nodeVar114 ) ) );
	nodeVar115.x = ( nodeVar115.x * object.nodeUniform27 );
	nodeVar115.y = ( nodeVar115.y * object.nodeUniform28 );
	nodeVar116 = textureSampleGrad( nodeUniform29, nodeUniform29_sampler, nodeVar115, vec2<f32>( 0.0, 0.0 ), vec2<f32>( 0.0, 0.0 ) );
	nodeVar117 = nodeVar116.xyz;
	nodeVar118 = fract( nodeVar109 );

	if ( ( nodeVar118 != 0.0 ) ) {

		nodeVar119 = ( nodeVar110 + 1.0 );
		nodeVar120 = getFace( ( object.nodeUniform25 * vec4<f32>( vec3<f32>( normalWorld.x, ( - normalWorld.y ), normalWorld.z ), 1.0 ) ).xyz );
		nodeVar121 = max( ( 4.0 - nodeVar119 ), 0.0 );
		nodeVar119 = max( nodeVar119, 4.0 );
		nodeVar122 = exp2( nodeVar119 );
		nodeVar123 = ( ( getUV( ( object.nodeUniform25 * vec4<f32>( vec3<f32>( normalWorld.x, ( - normalWorld.y ), normalWorld.z ), 1.0 ) ).xyz, nodeVar120 ) * vec2<f32>( ( nodeVar122 - 2.0 ) ) ) + vec2<f32>( 1.0 ) );

		if ( ( nodeVar120 > 2.0 ) ) {

			nodeVar123.y = ( nodeVar123.y + nodeVar122 );
			nodeVar120 = ( nodeVar120 - 3.0 );
			

		}

		nodeVar123.x = ( nodeVar123.x + ( nodeVar120 * nodeVar122 ) );
		nodeVar123.x = ( nodeVar123.x + ( nodeVar121 * ( 3.0 * 16.0 ) ) );
		nodeVar123.y = ( nodeVar123.y + ( 4.0 * ( exp2( object.nodeUniform24 ) - nodeVar122 ) ) );
		nodeVar123.x = ( nodeVar123.x * object.nodeUniform27 );
		nodeVar123.y = ( nodeVar123.y * object.nodeUniform28 );
		nodeVar124 = textureSampleGrad( nodeUniform29, nodeUniform29_sampler, nodeVar123, vec2<f32>( 0.0, 0.0 ), vec2<f32>( 0.0, 0.0 ) );
		nodeVar125 = nodeVar124.xyz;
		nodeVar117 = mix( nodeVar117, nodeVar125, nodeVar118 );
		

	}

	nodeVar126 = ( iblIrradiance + ( ( nodeVar117 * vec3<f32>( 3.141592653589793 ) ) * vec3<f32>( object.nodeUniform30 ) ) );
	iblIrradiance = nodeVar126;
	ambientOcclusion = 1.0;
	nodeVar127 = ( ambientOcclusion * AmbientOcclusion );
	ambientOcclusion = nodeVar127;
	irradiance = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar128 = ( DiffuseContribution * vec3<f32>( 0.3183098861837907 ) );
	nodeVar129 = ( irradiance * nodeVar128 );
	nodeVar130 = nodeVar129;
	indirectDiffuse = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar131 = ( indirectDiffuse + nodeVar130 );
	indirectDiffuse = nodeVar131;
	singleScatteringDielectric = vec3<f32>( 0.0, 0.0, 0.0 );
	multiScatteringDielectric = vec3<f32>( 0.0, 0.0, 0.0 );
	singleScatteringMetallic = vec3<f32>( 0.0, 0.0, 0.0 );
	multiScatteringMetallic = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar132 = dot( normalView, positionViewDirection );
	nodeVar133 = textureSample( nodeUniform23, nodeUniform23_sampler, vec2<f32>( Roughness, clamp( nodeVar132, 0.0, 1.0 ) ) );
	nodeVar134 = ( SpecularColor * vec3<f32>( nodeVar133.xy.x ) );
	nodeVar135 = ( SpecularF90 * nodeVar133.xy.y );
	nodeVar136 = ( nodeVar134 + vec3<f32>( nodeVar135 ) );
	nodeVar137 = ( singleScatteringDielectric + nodeVar136 );
	singleScatteringDielectric = nodeVar137;
	nodeVar138 = ( vec3<f32>( 1.0 ) - SpecularColor );
	nodeVar139 = nodeVar138;
	nodeVar140 = ( nodeVar139 * vec3<f32>( 0.047619 ) );
	nodeVar141 = ( SpecularColor + nodeVar140 );
	nodeVar142 = ( nodeVar136 * nodeVar141 );
	nodeVar143 = ( nodeVar133.xy.x + nodeVar133.xy.y );
	nodeVar144 = ( 1.0 - nodeVar143 );
	nodeVar145 = nodeVar144;
	nodeVar146 = ( vec3<f32>( nodeVar145 ) * nodeVar141 );
	nodeVar147 = ( vec3<f32>( 1.0 ) - nodeVar146 );
	nodeVar148 = nodeVar147;
	nodeVar149 = ( nodeVar142 / nodeVar148 );
	nodeVar150 = ( nodeVar149 * vec3<f32>( nodeVar145 ) );
	nodeVar151 = ( multiScatteringDielectric + nodeVar150 );
	multiScatteringDielectric = nodeVar151;
	nodeVar152 = dot( normalView, positionViewDirection );
	nodeVar153 = textureSample( nodeUniform23, nodeUniform23_sampler, vec2<f32>( Roughness, clamp( nodeVar152, 0.0, 1.0 ) ) );
	nodeVar154 = ( DiffuseColor.xyz * vec3<f32>( nodeVar153.xy.x ) );
	nodeVar155 = ( SpecularF90 * nodeVar153.xy.y );
	nodeVar156 = ( nodeVar154 + vec3<f32>( nodeVar155 ) );
	nodeVar157 = ( singleScatteringMetallic + nodeVar156 );
	singleScatteringMetallic = nodeVar157;
	nodeVar158 = ( vec3<f32>( 1.0 ) - DiffuseColor.xyz );
	nodeVar159 = nodeVar158;
	nodeVar160 = ( nodeVar159 * vec3<f32>( 0.047619 ) );
	nodeVar161 = ( DiffuseColor.xyz + nodeVar160 );
	nodeVar162 = ( nodeVar156 * nodeVar161 );
	nodeVar163 = ( nodeVar153.xy.x + nodeVar153.xy.y );
	nodeVar164 = ( 1.0 - nodeVar163 );
	nodeVar165 = nodeVar164;
	nodeVar166 = ( vec3<f32>( nodeVar165 ) * nodeVar161 );
	nodeVar167 = ( vec3<f32>( 1.0 ) - nodeVar166 );
	nodeVar168 = nodeVar167;
	nodeVar169 = ( nodeVar162 / nodeVar168 );
	nodeVar170 = ( nodeVar169 * vec3<f32>( nodeVar165 ) );
	nodeVar171 = ( multiScatteringMetallic + nodeVar170 );
	multiScatteringMetallic = nodeVar171;
	nodeVar172 = mix( singleScatteringDielectric, singleScatteringMetallic, Metalness );
	nodeVar173 = ( radiance * nodeVar172 );
	nodeVar174 = mix( multiScatteringDielectric, multiScatteringMetallic, Metalness );
	nodeVar175 = ( iblIrradiance * vec3<f32>( 0.3183098861837907 ) );
	nodeVar176 = ( nodeVar174 * nodeVar175 );
	nodeVar177 = ( nodeVar173 + nodeVar176 );
	nodeVar178 = nodeVar177;
	nodeVar179 = ( singleScatteringDielectric + multiScatteringDielectric );
	nodeVar180 = ( vec3<f32>( 1.0 ) - nodeVar179 );
	nodeVar181 = nodeVar180;
	nodeVar182 = ( DiffuseContribution * nodeVar181 );
	nodeVar183 = ( nodeVar182 * nodeVar175 );
	nodeVar184 = nodeVar183;
	indirectSpecular = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar185 = ( indirectSpecular + nodeVar178 );
	indirectSpecular = nodeVar185;
	nodeVar186 = ( indirectDiffuse + nodeVar184 );
	indirectDiffuse = nodeVar186;
	nodeVar187 = ( indirectDiffuse * vec3<f32>( ambientOcclusion ) );
	indirectDiffuse = nodeVar187;
	nodeVar188 = dot( normalView, positionViewDirection );
	nodeVar189 = ( clamp( nodeVar188, 0.0, 1.0 ) + ambientOcclusion );
	nodeVar190 = ( Roughness * -16.0 );
	nodeVar191 = ( 1.0 - nodeVar190 );
	nodeVar192 = nodeVar191;
	nodeVar193 = ( - nodeVar192 );
	nodeVar194 = exp2( nodeVar193 );
	nodeVar195 = pow( nodeVar189, nodeVar194 );
	nodeVar196 = ( 1.0 - nodeVar195 );
	nodeVar197 = nodeVar196;
	nodeVar198 = ( ambientOcclusion - nodeVar197 );
	nodeVar199 = ( indirectSpecular * vec3<f32>( clamp( nodeVar198, 0.0, 1.0 ) ) );
	indirectSpecular = nodeVar199;
	nodeVar200 = ( directDiffuse + indirectDiffuse );
	totalDiffuse = nodeVar200;
	nodeVar201 = ( directSpecular + indirectSpecular );
	totalSpecular = nodeVar201;
	nodeVar202 = ( totalDiffuse + totalSpecular );
	outgoingLight = nodeVar202;
	Output = max( vec4<f32>( ( outgoingLight + EmissiveColor ), DiffuseColor.w ), vec4<f32>( 0.0 ) );
	nodeVar203 = ( v_positionWorld - vec3<f32>( object.nodeUniform31, 0.0 ) );
	nodeVar204 = length( nodeVar203 );
	nodeVar205 = max( ( ( nodeVar204 / 1000.0 ) - 0.07 ), 0.0 );
	nodeVar206 = ( pow( ( max( ( nodeVar204 - 70.0 ), 0.0 ) / 1700.0 ), 1.28 ) * 0.34 );
	nodeVar207 = ( ( 1.0 - smoothstep( 8.0, 46.0, v_positionWorld.z ) ) * smoothstep( 520.0, 1600.0, nodeVar204 ) );
	nodeVar208 = exp( ( - ( ( ( vec3<f32>( 0.06549479999999999, 0.1011724, 0.19106559999999997 ) * vec3<f32>( nodeVar205 ) ) + vec3<f32>( nodeVar206 ) ) + vec3<f32>( ( nodeVar207 * 0.08 ) ) ) ) );
	nodeVar209 = normalize( ( v_positionWorld - render.cameraPosition ) );
	nodeVar210 = textureSample( nodeUniform32, nodeUniform32_sampler, vec2<f32>( ( ( atan2( nodeVar209.z, nodeVar209.x ) * 0.15915494309189535 ) + 0.5 ), ( ( asin( clamp( nodeVar209.y, -1.0, 1.0 ) ) * 0.3183098861837907 ) + 0.5 ) ) );
	nodeVar211 = nodeVar210.xyz;
	nodeVar212 = normalize( vec3<f32>( nodeVar209.x, nodeVar209.y, 0.004 ) );
	nodeVar213 = textureSample( nodeUniform32, nodeUniform32_sampler, vec2<f32>( ( ( atan2( nodeVar212.z, nodeVar212.x ) * 0.15915494309189535 ) + 0.5 ), ( ( asin( clamp( nodeVar212.y, -1.0, 1.0 ) ) * 0.3183098861837907 ) + 0.5 ) ) );
	nodeVar214 = vec4<f32>( ( ( Output.xyz * nodeVar208 ) + ( mix( mix( mix( nodeVar211, nodeVar213.xyz, ( smoothstep( -0.38, 0.0, nodeVar209.z ) * ( 1.0 - smoothstep( 0.0, 0.14, nodeVar209.z ) ) ) ), vec3<f32>( 1.0, 0.8, 0.52 ), ( pow( clamp( dot( nodeVar209, vec3<f32>( -0.9393727128473789, 1.1503997859949083e-16, 0.34289780745545134 ) ), 0.0, 1.0 ), 3.4 ) * 0.34 ) ), vec3<f32>( 0.84, 0.82, 0.72 ), ( nodeVar207 * 0.18 ) ) * ( vec3<f32>( 1.0, 1.0, 1.0 ) - nodeVar208 ) ) ), Output.w );
	Output = nodeVar214;

	// result

	output.color = nodeVar214;

	return output;

}
