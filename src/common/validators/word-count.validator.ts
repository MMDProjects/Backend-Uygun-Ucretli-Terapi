import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function WordCount(min: number, max: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'wordCount',
      target: object.constructor,
      propertyName,
      constraints: [min, max],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const [minWords, maxWords] = args.constraints as [number, number];
          const count = value.trim().split(/\s+/).filter(Boolean).length;
          return count >= minWords && count <= maxWords;
        },
        defaultMessage(args: ValidationArguments) {
          const [minWords, maxWords] = args.constraints as [number, number];
          return `${args.property} ${minWords} ile ${maxWords} kelime arasında olmalıdır`;
        },
      },
    });
  };
}
