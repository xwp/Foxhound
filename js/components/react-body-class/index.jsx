/*
 * This is forked from https://github.com/ryelle/react-body-class/blob/24e28ca7406af856b5051645fd4bca159bc17ab2/src/index.jsx
 * It is forked because there are body classes that need to persist.
 */

// External dependencies
import React, { Children, Component } from 'react';
import withSideEffect from 'react-side-effect';
import classNames from 'classnames';
import flatten from 'lodash/flatten';

class BodyClass extends Component {
	render() {
		if ( this.props.children ) {
			return Children.only( this.props.children );
		}
		return null;
	}
}

BodyClass.propTypes = {
	// classes is either an object { name: bool }, or list of names
	// classNames is smart enough to handle array + object combos
	classes: React.PropTypes.oneOfType( [
		React.PropTypes.object,
		React.PropTypes.arrayOf( React.PropTypes.string )
	] )
};

function reducePropsToState( propsList ) {
	// Pull out the classes from the props objects
	const classListArr = propsList.map( ( props ) => {
		return props.classes
	} );
	// Mash the classes together
	const classList = flatten( classListArr );
	if ( classList ) {
		return classList;
	}
}

function handleStateChangeOnClient( bodyClass ) {
	const persistentBodyClasses = [
		'customize-partial-edit-shortcuts-shown',
		'customize-partial-edit-shortcuts-hidden'
	];
	const mergedBodyClass = [ ...bodyClass ];
	for ( const className of persistentBodyClasses ) {
		if ( document.body.classList.contains( className ) ) {
			mergedBodyClass.push( className );
		}
	}

	document.body.className = classNames( mergedBodyClass );
}

export default withSideEffect(
	reducePropsToState,
	handleStateChangeOnClient
)( BodyClass );
