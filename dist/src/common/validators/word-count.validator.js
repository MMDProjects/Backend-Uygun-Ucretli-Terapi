"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordCount = WordCount;
const class_validator_1 = require("class-validator");
function WordCount(min, max, validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'wordCount',
            target: object.constructor,
            propertyName,
            constraints: [min, max],
            options: validationOptions,
            validator: {
                validate(value, args) {
                    if (typeof value !== 'string')
                        return false;
                    const [minWords, maxWords] = args.constraints;
                    const count = value.trim().split(/\s+/).filter(Boolean).length;
                    return count >= minWords && count <= maxWords;
                },
                defaultMessage(args) {
                    const [minWords, maxWords] = args.constraints;
                    return `${args.property} ${minWords} ile ${maxWords} kelime arasında olmalıdır`;
                },
            },
        });
    };
}
//# sourceMappingURL=word-count.validator.js.map