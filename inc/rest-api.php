<?php
/**
 * Foxhound REST API.
 *
 * @package Foxhound
 */

/**
 * Add endpoint for the site title.
 *
 * This is needed because rendered settings are not returned in the WP REST API settings endpoint.
 */
function foxhound_rest_api_init() {
	register_rest_route( 'foxhound/v1', 'title', array(
		'callback' => 'foxhound_rest_api_title_endpoint',
	) );
}
add_action( 'rest_api_init', 'foxhound_rest_api_init' );

/**
 * Get the raw and rendered title.
 *
 * @return array Raw and rendered title.
 */
function foxhound_rest_api_title_endpoint() {
	return array(
		'raw' => get_bloginfo( 'blogname', 'raw' ),
		'rendered' => get_bloginfo( 'blogname', 'display' ),
	);
}
