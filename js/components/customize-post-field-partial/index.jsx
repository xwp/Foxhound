/*global FoxhoundSettings, wp */
import React from 'react';
import { connect } from 'react-redux';

const CustomizePostFieldPartial = ( { customizing, container, post, field } ) => {
	if ( Array.isArray( container ) ) {
		throw new Error( 'CustomizePartial requires a single child.' );
	}

	if ( ! customizing ) {
		return container;
	}

	const controlId = 'post[' + post.type + '][' + String( post.id ) + '][post_' + field +  ']';

	function focusOnControl() {
		wp.customize.preview.send( 'focus-control', controlId );
	}

	const editShortcut = (
		<span key="edit-shortcut" className="customize-partial-edit-shortcut" onClick={ focusOnControl }>
			<button className="customize-partial-edit-shortcut-button">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
					<path d="M13.89 3.39l2.71 2.72c.46.46.42 1.24.03 1.64l-8.01 8.02-5.56 1.16 1.16-5.58s7.6-7.63 7.99-8.03c.39-.39 1.22-.39 1.68.07zm-2.73 2.79l-5.59 5.61 1.11 1.11 5.54-5.65zm-2.97 8.23l5.58-5.6-1.07-1.08-5.59 5.6z"/>
				</svg>
			</button>
		</span>
	);

	const props = { ...container.props };
	const content = props.dangerouslySetInnerHTML;
	delete props.dangerouslySetInnerHTML;

	const element = React.createElement(
		container.type,
		props,
		[
			editShortcut,
			<div key="edit-content" dangerouslySetInnerHTML={ content } />
		]
	);
	return element;
};

export default connect( ( state, ownProps ) => {
	return {
		customizing: typeof wp !== 'undefined' && wp.customize,
		...ownProps,
		container: ownProps.children
	};
} )( CustomizePostFieldPartial );
