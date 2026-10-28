package utils_test

import (
	"testing"

	"github.com/shridarpatil/whatomate/internal/utils"
	"github.com/stretchr/testify/assert"
)

func TestMaskPhoneNumber(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"", ""},
		{"1", "1"},
		{"12", "12"},
		{"123", "123"},
		{"1234", "1234"},
		{"12345", "*2345"},
		{"123456", "**3456"},
		{"9876543210", "******3210"},
		{"+14155552671", "********2671"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			actual := utils.MaskPhoneNumber(tt.input)
			assert.Equal(t, tt.expected, actual)
		})
	}
}

func TestLooksLikePhoneNumber(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"", false},
		{"12345", false}, // too short (< 7)
		{"hello", false},
		{"1234567", true},
		{"+1-415-555-2671", true},
		{"9876543210", true},
		{"+91 98765 43210", true},
		{"order_number_1234567890", false}, // mostly letters
		{"random string with no digits", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			actual := utils.LooksLikePhoneNumber(tt.input)
			assert.Equal(t, tt.expected, actual)
		})
	}
}

func TestMaskIfPhoneNumber(t *testing.T) {
	assert.Equal(t, "******3210", utils.MaskIfPhoneNumber("9876543210"))
	assert.Equal(t, "********2671", utils.MaskIfPhoneNumber("+14155552671"))
	assert.Equal(t, "Order created successfully", utils.MaskIfPhoneNumber("Order created successfully"))
	assert.Equal(t, "short", utils.MaskIfPhoneNumber("short"))
}
